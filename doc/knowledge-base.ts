export interface KnowledgeChunk {
  id: string
  category: string
  content: string
}

export const knowledgeBase: KnowledgeChunk[] = [
  // ── Thông tin chung ──────────────────────────────────────────────────────────
  {
    id: 'general-1',
    category: 'Thông tin trường',
    content:
      'Học viện Cảnh sát nhân dân (HVCSND) được thành lập ngày 15/05/1968 với tên ban đầu là Trường Cảnh sát nhân dân, tiền thân là trường Công an Trung ương. Ngày 15/05 là ngày truyền thống của Học viện. Địa chỉ: Phố Phạm Văn Nghị, phường Đông Ngạc, thành phố Hà Nội. Trực thuộc Bộ Công an.',
  },
  {
    id: 'general-2',
    category: 'Thông tin trường',
    content:
      'Học viện Cảnh sát nhân dân là cơ sở giáo dục đại học công lập đào tạo đa ngành, đa lĩnh vực trong hệ thống giáo dục quốc dân trực thuộc Bộ Công an. Nhiệm vụ: đào tạo cán bộ bậc đại học, thạc sĩ, tiến sĩ; bồi dưỡng chuyên môn cho lãnh đạo lực lượng Cảnh sát nhân dân; nghiên cứu khoa học; hợp tác quốc tế.',
  },
  {
    id: 'general-3',
    category: 'Thông tin trường',
    content:
      'Thành tích nổi bật: Năm 2025 được tặng danh hiệu Anh hùng lực lượng vũ trang nhân dân lần thứ 3. Năm 2015 được công nhận là cơ sở giáo dục đại học trọng điểm của ngành Công an. Nhiều năm liên tiếp dẫn đầu phong trào thi đua trong ngành.',
  },

  // ── Sứ mạng – Tầm nhìn ───────────────────────────────────────────────────────
  {
    id: 'mission-1',
    category: 'Sứ mạng và tầm nhìn',
    content:
      'Tầm nhìn: Phấn đấu đến năm 2025, Học viện Cảnh sát nhân dân trở thành cơ sở giáo dục trọng điểm quốc gia, tiến tới là một trong những trung tâm đào tạo Cảnh sát hàng đầu trong khu vực ASEAN.',
  },
  {
    id: 'mission-2',
    category: 'Sứ mạng và tầm nhìn',
    content:
      'Giá trị cốt lõi: "Chất lượng cao – Tiên phong – Hội nhập – Phát triển bền vững". Phương châm hành động: "Chủ động – Nêu gương – Kỷ cương – Trách nhiệm – Hiệu quả". Triết lý giáo dục: "Chính trị vững vàng – Pháp luật tinh thông – Nghiệp vụ sắc bén – Vì Nhân dân phục vụ".',
  },

  // ── Ngành học – Đại học chính quy ────────────────────────────────────────────
  {
    id: 'major-overview',
    category: 'Ngành học đại học chính quy',
    content:
      'Học viện CSND hiện đào tạo 10 ngành với 16 chuyên ngành bậc đại học hệ chính quy. Từ năm học 2010–2011 chuyển sang đào tạo theo hệ thống tín chỉ. Chương trình 5 năm áp dụng cho khóa D36–D38; chương trình 4 năm áp dụng từ khóa D39 trở đi. Đến nay đã tổ chức 42 khóa đại học chính quy với gần 17.000 sinh viên.',
  },
  {
    id: 'major-1',
    category: 'Ngành học đại học chính quy',
    content:
      'Ngành Trinh sát cảnh sát: 5 chuyên ngành gồm Trinh sát phòng chống tội phạm về trật tự xã hội, Trinh sát phòng chống tội phạm về kinh tế, Trinh sát phòng chống tội phạm về ma túy, Trinh sát phòng chống tội phạm về môi trường, Trinh sát phòng chống tội phạm sử dụng công nghệ cao.',
  },
  {
    id: 'major-2',
    category: 'Ngành học đại học chính quy',
    content:
      'Ngành Điều tra hình sự: chuyên ngành Điều tra tội phạm về trật tự xã hội. Ngành Quản lý nhà nước về an ninh trật tự: chuyên ngành Quản lý hành chính về trật tự xã hội.',
  },
  {
    id: 'major-3',
    category: 'Ngành học đại học chính quy',
    content:
      'Ngành Quản lý trật tự an toàn giao thông: 2 chuyên ngành gồm Quản lý trật tự an toàn giao thông đường bộ và đường sắt, Quản lý trật tự an toàn giao thông đường thủy. Ngành Kỹ thuật hình sự: chuyên ngành Kỹ thuật hình sự.',
  },
  {
    id: 'major-4',
    category: 'Ngành học đại học chính quy',
    content:
      'Ngành Thi hành án hình sự và hỗ trợ tư pháp: chuyên ngành Quản lý, giáo dục và cải tạo phạm nhân. Ngành Tham mưu, chỉ huy Công an nhân dân: chuyên ngành Tham mưu, chỉ huy vũ trang bảo vệ an ninh trật tự.',
  },
  {
    id: 'major-5',
    category: 'Ngành học đại học chính quy',
    content:
      'Ngành Ngôn ngữ Anh: chuyên ngành Tiếng Anh Cảnh sát. Ngành Ngôn ngữ Trung Quốc: chuyên ngành Tiếng Trung Quốc Cảnh sát. Ngành Luật: 2 chuyên ngành gồm Luật Tố tụng hình sự và Tư pháp hình sự.',
  },

  // ── Hệ liên thông ─────────────────────────────────────────────────────────────
  {
    id: 'lienThong-1',
    category: 'Đào tạo hệ liên thông',
    content:
      'Đào tạo liên thông từ trung cấp lên đại học: thời gian 3 năm. Điều kiện: Cán bộ Công an đã tốt nghiệp trường Trung cấp CAND và có thời gian công tác đủ 36 tháng. Đến nay đã tổ chức 32 khóa với hơn 7.500 học viên, 29 khóa đã hoàn thành.',
  },
  {
    id: 'lienThong-2',
    category: 'Đào tạo hệ liên thông',
    content:
      'Các chuyên ngành đào tạo liên thông: Quản lý nhà nước về trật tự xã hội; Trinh sát và điều tra tội phạm (trật tự xã hội, kinh tế, ma túy); Kỹ thuật hình sự; Quản lý trật tự an toàn giao thông; Quản lý, giáo dục và cải tạo phạm nhân; Tham mưu, chỉ huy vũ trang bảo vệ ANTT.',
  },

  // ── Hệ vừa làm vừa học ────────────────────────────────────────────────────────
  {
    id: 'vlvh-1',
    category: 'Đào tạo hệ vừa làm vừa học',
    content:
      'Hệ vừa làm vừa học (VLVH): thời gian 4,5 năm, đào tạo tại trường và các lớp liên kết với đơn vị, địa phương. Quy mô hơn 12.500 học viên, chiếm khoảng 50% tổng quy mô đào tạo của Học viện. Từ năm 1981 đến nay đã tổ chức 43 khóa với hơn 29.279 học viên, trong đó hơn 18.000 đã tốt nghiệp.',
  },
  {
    id: 'vlvh-2',
    category: 'Đào tạo hệ vừa làm vừa học',
    content:
      'Các chuyên ngành hệ VLVH: Điều tra trinh sát; Điều tra hình sự; Thi hành án hình sự và hỗ trợ tư pháp; Quản lý nhà nước về an ninh trật tự; Tham mưu, chỉ huy CAND.',
  },

  // ── Các hình thức đào tạo khác ────────────────────────────────────────────────
  {
    id: 'otherTraining-1',
    category: 'Các hình thức đào tạo khác',
    content:
      'Đại học văn bằng 2: thời gian 2 năm. Đào tạo Điều tra viên: thời gian 3 năm. Đào tạo sau đại học (thạc sĩ, tiến sĩ): dành cho cán bộ có bằng đại học ngành liên quan. Bồi dưỡng chuyên môn cho lãnh đạo, chỉ huy các cấp trong lực lượng Cảnh sát nhân dân.',
  },

  // ── Chuẩn đầu ra ─────────────────────────────────────────────────────────────
  {
    id: 'outcome-1',
    category: 'Chuẩn đầu ra',
    content:
      'Học viện CSND áp dụng chuẩn đầu ra từ năm học 2009–2010, là cơ sở giáo dục đầu tiên trong CAND công bố chuẩn đầu ra. Có 3 nhóm chuẩn: (1) Chuẩn chính trị, (2) Chuẩn chuyên môn nghiệp vụ, (3) Chuẩn kỹ năng mềm.',
  },
  {
    id: 'outcome-2',
    category: 'Chuẩn đầu ra',
    content:
      'Chuẩn chính trị: sinh viên tốt nghiệp phải là Đảng viên Đảng Cộng sản Việt Nam hoặc có Giấy chứng nhận đã qua lớp Bồi dưỡng kiến thức về Đảng. Chuẩn chuyên môn: 2/3 số môn nghiệp vụ chuyên ngành đạt từ 6,5 điểm trở lên (hệ niên chế) hoặc từ 2,7 GPA trở lên (hệ tín chỉ).',
  },
  {
    id: 'outcome-3',
    category: 'Chuẩn đầu ra',
    content:
      'Chuẩn ngoại ngữ đầu ra bậc đại học: Tiếng Anh đạt TOEIC 450 điểm hoặc tương đương. Tiếng Pháp đạt DELF B1. Tiếng Trung Quốc đạt HSK cấp 4. Bậc thạc sĩ: TOEFL IPT 500, DELF B1, HSK cấp 5. Bậc tiến sĩ: TOEFL IPT 550, DELF D1, HSK cấp 6. Tin học: chứng chỉ B (đại học), chứng chỉ C (thạc sĩ/tiến sĩ).',
  },
  {
    id: 'outcome-4',
    category: 'Chuẩn đầu ra',
    content:
      'Chuẩn kỹ năng thực hành bắt buộc khi tốt nghiệp: Bắn súng ngắn đạt tối thiểu 70/100 điểm (5 viên bia cố định + 5 viên bia ẩn hiện, mỗi bài tối thiểu 25/50 điểm). Võ thuật: đạt chứng chỉ võ thuật CAND Chương trình nâng cao (tương đương tiểu giáo viên võ thuật). Lái xe: có GPLX mô tô A1 và ô tô B1/B2; riêng CSGT cần A2/A3 và ô tô hạng C.',
  },

  // ── Chương trình chất lượng cao & song bằng ──────────────────────────────────
  {
    id: 'clc-1',
    category: 'Chương trình chất lượng cao',
    content:
      'Chương trình cử nhân chất lượng cao (CLC) triển khai từ năm học 2002–2003. Đào tạo 2 chuyên ngành: Điều tra tội phạm xâm phạm trật tự an toàn xã hội và Kỹ thuật hình sự. Đối tượng: sinh viên đạt giải quốc tế/quốc gia, hoặc lấy điểm từ cao xuống thấp kết hợp tiêu chuẩn tốt nghiệp loại giỏi, học sinh giỏi/tiên tiến THPT.',
  },
  {
    id: 'doubleDegree-1',
    category: 'Chương trình song bằng',
    content:
      'Chương trình đào tạo song bằng áp dụng từ khóa tuyển sinh năm 2015 (ưu tiên sinh viên CLC). Các ngành có thể học song song: Tiếng Anh Cảnh sát, Tiếng Trung Cảnh sát, Điều tra hình sự, Quản lý nhà nước về ANTT, Trinh sát Cảnh sát, Luật, Quản lý trật tự an toàn giao thông. Số tín chỉ tích lũy theo quy định của Giám đốc Học viện.',
  },

  // ── Liên hệ ───────────────────────────────────────────────────────────────────
  {
    id: 'contact-1',
    category: 'Liên hệ',
    content:
      'Học viện Cảnh sát nhân dân. Địa chỉ: Phố Phạm Văn Nghị, phường Đông Ngạc, thành phố Hà Nội. Website: https://hvcsnd.edu.vn. Email: mail.hvcsnd.edu.vn. Trực thuộc Bộ Công an.',
  },

  // ── Hướng dẫn tuyển sinh CAND 2026 ──────────────────────────────────────────
  {
    id: 'hdts2026-1',
    category: 'Hướng dẫn tuyển sinh CAND 2026',
    content:
      'Hướng dẫn tuyển sinh CAND năm 2026 ban hành theo Bộ Công an, căn cứ Thông tư số 50/2021/TT-BCA (sửa đổi, bổ sung năm 2025) và Quyết định số 523/QĐ-BCA ngày 30/01/2026 về phân bổ chỉ tiêu tuyển sinh. Nguyên tắc tuyển sinh: công khai, công bằng, dân chủ, đúng quy định.',
  },
  {
    id: 'hdts2026-phuongthuc',
    category: 'Phương thức tuyển sinh đại học chính quy 2026',
    content:
      'Tuyển sinh đại học chính quy CAND năm 2026 có 3 phương thức: Phương thức 1 – xét tuyển thẳng (thí sinh đoạt giải quốc gia, quốc tế, đội tuyển Olympic); Phương thức 2 – kết hợp bài thi đánh giá của Bộ Công an (60%) và chứng chỉ ngoại ngữ quốc tế (40%); Phương thức 3 – kết hợp bài thi đánh giá của Bộ Công an (60%) và điểm 3 môn thi THPT theo tổ hợp xét tuyển (40%). Thí sinh đăng ký nguyện vọng xét tuyển vào trường CAND phải đặt ở Nguyện vọng số 1.',
  },
  {
    id: 'hdts2026-sotuyenDH',
    category: 'Sơ tuyển đại học CAND 2026',
    content:
      'Quy trình sơ tuyển đại học CAND 2026 gồm: (1) Kiểm tra học lực, hạnh kiểm tại học bạ; (2) Kiểm tra sức khỏe; (3) Thẩm tra, xác minh tiêu chuẩn chính trị; (4) Kiểm tra khả năng vận động: Nam gồm chạy 100m, chạy 1500m, bật xa tại chỗ, co tay xà đơn; Nữ gồm chạy 100m, chạy 800m, bật xa tại chỗ. Thí sinh đăng ký sơ tuyển tại Công an cấp xã nơi thường trú. Lệ phí: 300.000 đồng (120.000đ sơ tuyển + 180.000đ thi tuyển).',
  },
  {
    id: 'hdts2026-uutien',
    category: 'Điểm ưu tiên tuyển sinh CAND 2026',
    content:
      'Điểm ưu tiên khu vực và đối tượng thực hiện theo Thông tư số 06/2026/TT-BGDĐT ngày 15/02/2026. Điểm ưu tiên khu vực chỉ áp dụng cho thí sinh tốt nghiệp THPT năm 2026 hoặc 2025 (tốt nghiệp từ năm 2024 trở về trước không được cộng điểm ưu tiên khu vực). Điểm thưởng của Bộ Công an: giải nhất quốc gia/quốc tế +1,0 điểm; giải nhì +0,75; giải ba +0,5; giải khuyến khích +0,25. Thí sinh đoạt nhiều giải chỉ được cộng giải cao nhất.',
  },
  {
    id: 'hdts2026-congthuc-pt3',
    category: 'Công thức tính điểm xét tuyển đại học CAND 2026',
    content:
      'Phương thức 3 (kết hợp điểm thi THPT + bài thi BCA): ĐXT = (M1+M2+M3)*2/5 + BTBCA*3/5 + ĐC. Phương thức 2 (kết hợp ngoại ngữ quốc tế + bài thi BCA): ĐXT = BTBCA*3/5 + TA*2/5 + ĐC. Trong đó ĐC = ĐT + KV + Đth. Khi tổng điểm đạt từ 22,5 trở lên (thang 30), điểm cộng được điều chỉnh theo công thức: ĐC = [(30 - tổng điểm)/7,5] × (ĐT + KV + Đth).',
  },
  {
    id: 'hdts2026-hosoDH',
    category: 'Hồ sơ tuyển sinh đại học CAND 2026',
    content:
      'Hồ sơ chung: Bìa hồ sơ tuyển sinh, Lý lịch tự khai, Thẩm tra lý lịch, Đơn xin dự tuyển, Phiếu đăng ký dự tuyển (có chữ ký thí sinh và đóng dấu đơn vị sơ tuyển). Phương thức 1: bổ sung Phiếu đăng ký xét tuyển thẳng, bản sao giấy chứng nhận giải, học bạ THPT, giấy báo dự thi, bản photo Căn cước. Phương thức 2: bổ sung bản sao chứng chỉ ngoại ngữ quốc tế. Phương thức 3: bổ sung học bạ THPT, giấy báo dự thi, tài liệu chứng minh ưu tiên.',
  },
  {
    id: 'hdts2026-saudaihoc',
    category: 'Tuyển sinh sau đại học CAND 2026',
    content:
      'Tuyển sinh tiến sĩ CAND 2026: đối tượng gồm cán bộ quản lý giáo dục/giảng viên trường CAND, lãnh đạo cấp phòng trở lên, cán bộ chức danh cao cấp. Điều kiện: không quá 50 tuổi, công tác thực tế từ 24 tháng trở lên, có bằng thạc sĩ hoặc đại học loại giỏi, xếp loại "Hoàn thành tốt nhiệm vụ" năm trước. Tuyển sinh thạc sĩ: đối tượng là cán bộ giáo dục, chỉ huy cấp đội trở lên, chuyên viên trở lên. Điều kiện: không quá 45 tuổi, có bằng đại học, công tác thực tế từ 24 tháng (giảng viên 12 tháng). Chỉ tiếp nhận cán bộ Bộ Quốc phòng theo kế hoạch hợp tác; không tiếp nhận ngành An ninh, Tình báo với ngoài ngành.',
  },
  {
    id: 'hdts2026-thacsi-xettuyen',
    category: 'Xét tuyển thạc sĩ CAND 2026',
    content:
      'Xét tuyển thạc sĩ CAND 2026 theo công thức: ĐXT = H + B + ĐUT. Trong đó H là điểm học tập toàn khóa đại học (thang 10), B là điểm bài luận thể hiện khả năng NCKH (thang 10, thi tự luận 1 buổi), ĐUT là điểm ưu tiên đối tượng. Tiêu chí phụ khi bằng điểm: xét điểm bài luận cao hơn, sau đó xét thời gian công tác thực tế trong CAND từ cao xuống thấp.',
  },
  {
    id: 'hdts2026-vlvh',
    category: 'Tuyển sinh đại học vừa làm vừa học CAND 2026',
    content:
      'Đại học VLVH CAND 2026 – điều kiện: không quá 45 tuổi; cán bộ nghiệp vụ có công tác thực tế từ 36 tháng; cán bộ kỹ thuật từ 10 năm; xếp loại "Hoàn thành tốt nhiệm vụ" năm trước. Xét tuyển theo công thức ĐXT = H + B + ĐUT, trong đó H là điểm trung bình học tập THPT (3 năm), B là điểm bài kiểm tra đánh giá tại trường CAND. Trường hợp không xác định được điểm THPT: ĐXT = B + ĐUT.',
  },
  {
    id: 'hdts2026-lienhong',
    category: 'Tuyển sinh liên thông CAND 2026',
    content:
      'Liên thông trung cấp → đại học CAND 2026: Điều kiện – bằng tốt nghiệp trung cấp CAND ngành phù hợp, không quá 45 tuổi, công tác thực tế từ 24 tháng (bằng giỏi thì 12 tháng), xếp loại hoàn thành tốt. Phương thức 1: điểm học tập trung cấp từ 6.0 trở lên. Phương thức 2: thi bài thi đánh giá của Bộ Công an, ĐXT = H*3/5 + B*2/5 + ĐUT (H là điểm trung cấp 60%, B là điểm bài thi 40%). Liên thông cao đẳng → đại học: Phương thức 1 – điểm học tập cao đẳng từ 5.0 trở lên.',
  },
  {
    id: 'hdts2026-vb2ca',
    category: 'Tuyển sinh văn bằng 2 ngành Công an (VB2CA) 2026',
    content:
      'Tuyển sinh VB2CA (văn bằng 2 trình độ đại học ngành Công an) dành cho công dân có bằng đại học trở lên. Ngưỡng đầu vào Phương thức 2: bài thi đánh giá Bộ Công an đạt từ 50 điểm trở lên (thang 100). Điểm thưởng: IELTS từ 6.5 trở lên +1,0 điểm; từ 6.0 trở lên +0,5 điểm; con đẻ cán bộ Công an +1,0 điểm. Xét tuyển: ĐXT = BTBCA*3/10 + ĐC. Hồ sơ cần bổ sung bằng tốt nghiệp đại học + bảng điểm, chứng chỉ ngoại ngữ quốc tế (nếu có).',
  },
  {
    id: 'hdts2026-trungcap',
    category: 'Tuyển sinh trung cấp CAND 2026',
    content:
      'Tuyển sinh trung cấp chính quy CAND 2026: X02 là đơn vị tổ chức xét tuyển. Dữ liệu từ phần mềm tuyển sinh các trường CAND, Công an đơn vị/địa phương và điểm thi THPT từ Bộ GD&ĐT. Quy trình tương tự Phương thức 3 tuyển đại học chính quy. Điểm thưởng: giải quốc gia/quốc tế tương ứng; con đẻ cán bộ Công an hiện tác hoặc đã nghỉ hưu (công tác liên tục từ 15 năm) +1,0 điểm; con Trưởng/Phó Công an xã bán chuyên trách (từ 15 năm) +0,5 điểm.',
  },
  {
    id: 'hdts2026-tieuchiph',
    category: 'Tiêu chí phụ xét tuyển CAND 2026',
    content:
      'Khi nhiều thí sinh cùng điểm xét tuyển, vượt chỉ tiêu, xét theo thứ tự: (1) Thí sinh có chứng chỉ ngoại ngữ quốc tế, điểm cao hơn; (2) Điểm bài thi đánh giá Bộ Công an cao hơn; (3) Điểm phần tự luận trong bài thi cao hơn. Trường hợp vượt chỉ tiêu sau tất cả tiêu chí phụ, X02 phối hợp X01 báo cáo lãnh đạo Bộ quyết định.',
  },
  {
    id: 'hdts2026-chinhsachut',
    category: 'Chính trị và tiêu chuẩn sức khỏe tuyển sinh CAND 2026',
    content:
      'Tiêu chuẩn chính trị: Công an đơn vị/địa phương tra cứu Mẫu B5 tại cơ quan hồ sơ nghiệp vụ cho tất cả thí sinh. Sau khi trúng tuyển mới tiến hành thẩm tra, xác minh, kết luận chính thức. Thí sinh không đảm bảo tiêu chuẩn chính trị không được xét tuyển và cần điều chỉnh nguyện vọng sang trường ngoài ngành. Chỉ giải quyết nhập học khi đảm bảo tiêu chuẩn chính trị.',
  },
  {
    id: 'hdts2026-T11-trungcap',
    category: 'Học sinh tốt nghiệp T11 xét tuyển trung cấp CAND 2026',
    content:
      'Học sinh tốt nghiệp T11 không trúng tuyển đại học/trung cấp chính quy tuyển mới nhưng có nguyện vọng xét tuyển trung cấp CAND 2026. Điều kiện: phải là người dân tộc thiểu số, thường trú tại thôn/xã đặc biệt khó khăn, xã biên giới, an toàn khu, ven biển, hải đảo. Không xét chọn học sinh bị kỷ luật từ khiển trách trở lên trong 3 năm THPT hoặc chưa được kết nạp Đoàn. Chỉ tiêu = (số HS tốt nghiệp THPT − số đã trúng tuyển ĐH/TC CAND) × 20%, tối đa 20 chỉ tiêu. Công thức: ĐXC = BTBCA × 3/10 + KV + ĐT + ĐTh. Tiêu chí phụ: (1) con đẻ người có uy tín trong đồng bào DTTS, (2) điểm phần tự luận bài thi BCA cao hơn, (3) điểm 3 môn thi THPT theo tổ hợp trung cấp CAND.',
  },
  {
    id: 'hdts2026-cubodaotao-trungcap',
    category: 'Tuyển sinh cử cán bộ đào tạo trung cấp CAND 2026',
    content:
      'Tuyển sinh cử cán bộ trong biên chế đào tạo trung cấp CAND 2026. Điều kiện: có bằng THPT hoặc tốt nghiệp trung cấp; không quá 40 tuổi; xếp loại "Hoàn thành nhiệm vụ" năm liền trước (mức thấp hơn các loại hình đào tạo khác). Riêng cán bộ chuyên môn kỹ thuật: phải có thời gian công tác từ 08 năm trở lên kể từ khi được tuyển chọn vào CAND.',
  },
  {
    id: 'hdts2026-T11-truong',
    category: 'Tuyển sinh trường T11 (Giáo dục văn hóa bậc THPT) 2026',
    content:
      'Tuyển sinh vào trường văn hóa T11 bậc THPT năm 2026. Chỉ tiêu: 150 (135 nam, 15 nữ). Tuyển thẳng áp dụng với: con đẻ liệt sĩ CAND, con đẻ thương binh CAND (thương tật ≥ 81%), con đẻ Anh hùng LLVT/Anh hùng Lao động trong CAND, con đẻ công dân được công nhận liệt sĩ khi đấu tranh chống tội phạm nguy hiểm. Điều kiện tuyển thẳng: tốt nghiệp THCS trong năm dự tuyển, học lực Khá trở lên và hạnh kiểm Tốt trong tất cả các năm THCS, đủ sức khỏe theo TT 62/2023 và TT 131/2025/TT-BCA. Xét tuyển (DTTS): thường trú ≥ 5 năm tại vùng đặc biệt khó khăn/biên giới/ven biển/hải đảo, học THCS liên tục tại trường ở địa bàn khó khăn hoặc trường DTNT, thông thạo tiếng nói dân tộc mình (có xác nhận đơn vị sơ tuyển). Tiêu chí phụ: con đẻ liệt sĩ/người có uy tín DTTS → tổng điểm TB các môn THCS (lớp 6–9) → điểm môn Toán.',
  },
  {
    id: 'hdts2026-nguyenvong',
    category: 'Đăng ký nguyện vọng xét tuyển CAND 2026',
    content:
      'Thí sinh có nguyện vọng vào trường CAND phải đặt nguyện vọng trường CAND ở Nguyện vọng số 1 trên Cổng Thông tin tuyển sinh. Tổ hợp xét tuyển phải khớp với tổ hợp đã đăng ký trong dữ liệu tuyển sinh của Bộ Công an; nếu không đăng ký tổ hợp trong dữ liệu BCA thì sẽ không được xét tuyển theo tổ hợp đó. Thí sinh không đăng ký xét tuyển theo lịch trình của Bộ GD&ĐT được coi như không có nguyện vọng vào trường CAND.',
  },
  {
    id: 'hdts2026-tochucthuchien',
    category: 'Trách nhiệm tổ chức tuyển sinh CAND 2026',
    content:
      'X02 chủ trì hướng dẫn công tác tuyển sinh, thành lập Đoàn kiểm tra giám sát, hướng dẫn xét tuyển bổ sung, tổng hợp báo cáo lãnh đạo Bộ. Công an các đơn vị/địa phương: thành lập Hội đồng sơ tuyển, tập huấn cán bộ, chịu trách nhiệm toàn bộ khâu sơ tuyển, giải quyết đơn thư khiếu nại. Các trường CAND: thành lập Hội đồng tuyển sinh, tiếp nhận giải quyết khiếu nại, trước ngày 20/12/2026 tổng kết và gửi báo cáo về Bộ qua X02.',
  },
]
