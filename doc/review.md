⏺ Dựa trên phân tích toàn bộ pipeline, đây là các điểm yếu và phương án cải thiện theo mức độ tác động:

---

Phân tích hiện trạng

Điểm yếu nghiêm trọng nhất

1. Model quá nhỏ — llama-3.1-8b-instant  
   Đây là model tối ưu cho tốc độ, không phải độ chính xác. 8B params thường ảo giác và diễn giải sai context.  

2. maxTokens: 512 quá thấp
   Câu trả lời bị cắt giữa chừng khi cần giải thích dài. Groq default cho 8B là nhanh nên không cần tối ưu token.  

3. Không có reranking  
   Hệ thống lấy 10 chunks gần nhất về cosine distance, nhưng cosine distance của embedding không hoàn toàn tương quan  
   với độ liên quan ngữ nghĩa. Chunks xếp thứ 3–7 đôi khi liên quan hơn top-1.  

4. Chunking chỉ dựa trên heading số/La Mã  
   structural-splitter.ts chỉ nhận dạng pattern I., 1., 1.1. — tài liệu plain text hoặc DOCX không có heading chuẩn sẽ
   ra 1 chunk khổng lồ.  

5. Không có hybrid search  
   Vector search tốt với câu hỏi ngữ nghĩa, nhưng kém với từ khoá chính xác (mã ngành 8310302, năm 2025, tên trường cụ
   thể). BM25/full-text bắt chính xác những gì embedding bỏ sót.  


---

Phương án theo mức độ ưu tiên

🔴 Ưu tiên cao — tác động ngay lập tức

A. Nâng model lên llama-3.3-70b-versatile

Groq free tier hỗ trợ model này với 6000 TPM. Chất lượng reasoning tốt hơn 8B đáng kể.

# .env

GROQ_MODEL="llama-3.3-70b-versatile"

Chi phí: không tốn tiền thêm nếu dùng Groq free, chỉ chậm hơn ~2-3 giây.

B. Tăng maxTokens từ 512 → 1024

KnowledgeBase.maxTokens default: 512 → 1024

C. Thêm tên tài liệu vào context

Hiện tại chunk được gửi vào prompt không có metadata nguồn. AI không biết thông tin từ đâu để trả lời chính xác hơn.
Sửa buildPrompt trong rag.service.ts để thêm tên document vào mỗi chunk.

D. Giảm số chunks từ 10 → 5 nhưng chọn tốt hơn

10 chunks đôi khi đưa vào nhiều context nhiễu, confuse model nhỏ. Nên lấy top-5 có distance thấp nhất sau khi đã  
 filter threshold.

---

🟡 Ưu tiên trung bình — cải thiện đáng kể

E. Hybrid Search: Vector + Full-text (BM25)

PostgreSQL có sẵn tsvector/tsquery cho full-text search. Kết hợp 2 nguồn:

-- Vector search (semantic)  
 embedding <=> query_vec AS vec_score

-- Full-text search (keyword exact match)  
 ts_rank(to_tsvector('simple', content),  
 plainto_tsquery('simple', 'mã ngành 8310302')) AS text_score

-- Hybrid score  
 0.7 _ (1 - vec_score) + 0.3 _ text_score AS final_score

Đặc biệt hiệu quả với: mã ngành, năm tuyển sinh, tên trường, con số cụ thể.

F. Query Rewriting trước khi embed

Người dùng hỏi ngắn/sai ngữ pháp → embedding không khớp tốt. Thêm bước gọi LLM để viết lại câu hỏi trước khi embed:

User: "học csnd cần gì"  
 → Rewrite: "Điều kiện và tiêu chuẩn tuyển sinh vào Học viện Cảnh sát nhân dân là gì?"  
 → Embed rewritten query → vector search

G. Cải thiện chunking cho tài liệu không có heading

Thêm fallback chunking theo đoạn văn (500 token, overlap 50) khi structural split chỉ tạo ra < 3 chunks từ toàn bộ  
 tài liệu.

---

🟢 Ưu tiên thấp — cải thiện dài hạn

H. Self-RAG / Confidence check

Sau khi AI trả lời, gọi thêm 1 lần LLM để tự đánh giá: "Câu trả lời này có được hỗ trợ bởi tài liệu không? Điểm tin
cậy 1-10?"  
 Nếu < 7 → trả về disclaimer rõ ràng hơn.

I. Câu hỏi làm rõ (Clarifying questions)

Khi câu hỏi mơ hồ hoặc không tìm được chunk liên quan, thay vì trả về "không tìm thấy" thì hỏi lại:  
 ▎ "Bạn hỏi về điều kiện tuyển sinh trường CSND hay học phí ạ?"

J. Semantic caching

Lưu câu trả lời hoàn chỉnh của câu hỏi phổ biến vào Redis, khi câu hỏi mới có cosine distance < 0.05 so với câu đã  
 cache → trả về cached answer, bỏ qua toàn bộ RAG.

---

Đề xuất thực hiện ngay (30 phút)

Thứ tự làm để có kết quả nhanh nhất:

1. Đổi model → .env: GROQ_MODEL="llama-3.3-70b-versatile" — restart API
2. Tăng maxTokens → update default trong DB seed hoặc qua CMS /chatbot
3. Thêm source metadata vào chunk context — sửa buildPrompt trong rag.service.ts  


Bạn muốn tôi implement phương án nào trước?
