# Hướng dẫn kết nối Chatbot với Facebook Messenger

> Ngày cập nhật: 2026-04-14
> Áp dụng cho: `apps/api` — `MessengerController`, `MessengerAdapter`, `MessengerProcessor`

---

## Tổng quan luồng hoạt động

```
User nhắn tin Facebook Page
        │
        ▼ (webhook POST, < 5 giây timeout)
POST /webhooks/messenger/:integrationId
        │
        ├─ 1. Verify HMAC-SHA256 (X-Hub-Signature-256 vs App Secret)
        ├─ 2. Parse payload → lấy sender.id + text
        ├─ 3. Enqueue BullMQ job
        └─ 4. Trả 200 OK ngay lập tức
                │
                BullMQ Worker (async)
                ├─ 5. sendTyping_on → user thấy "đang gõ..."
                ├─ 6. chatInternal() → FAQ → RAG → AI
                └─ 7. Graph API POST /me/messages → gửi reply
```

---

## Phần I — Chuẩn bị trên Meta for Developers

### Bước 1 — Tạo Meta App

1. Truy cập [https://developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**
2. Chọn **Business** (hoặc **Other** nếu không có Business Manager)
3. App Name: đặt tên tùy ý (VD: `My Chatbot`)
4. Hoàn tất tạo app

### Bước 2 — Thêm sản phẩm Messenger

1. Trong App Dashboard → sidebar **Add Product** → tìm **Messenger** → **Set Up**
2. Vào **Messenger** → **Settings** (hoặc **Messenger API Settings**)

### Bước 3 — Lấy Page Access Token

1. Trong mục **Access Tokens** → chọn Facebook Page bạn muốn kết nối
2. Nếu chưa có Page, tạo mới tại [facebook.com/pages/create](https://www.facebook.com/pages/create)
3. Bấm **Generate Token** → copy token (bắt đầu bằng `EAA...`)

> **Quan trọng:** Token này là **short-lived** (~1 giờ). Để dùng lâu dài cần đổi sang **long-lived Page Access Token** (xem Phụ lục A).

### Bước 4 — Lấy App Secret

1. Sidebar → **Settings** → **Basic**
2. Tìm trường **App Secret** → **Show** → copy

### Bước 5 — Lấy Page ID

1. Vào Facebook Page → **About** → **Page Transparency** → **Page ID**
2. Hoặc vào Settings của Page → **Page Info** → copy **Page ID** (dãy số)

### Bước 6 — Đặt Verify Token

Đây là chuỗi **bạn tự đặt** (không lấy từ Meta), dùng để Meta xác minh webhook URL của bạn.

Ví dụ: `my-chatbot-verify-token-2024`

> Ghi lại 4 giá trị: `Page ID`, `Page Access Token`, `App Secret`, `Verify Token`

---

## Phần II — Tạo tích hợp trong CMS

### Bước 7 — Mở trang Tích hợp

1. Đăng nhập CMS → sidebar **Tích hợp kênh**
2. Bấm vào card **Facebook Messenger**
3. Modal cấu hình xuất hiện

### Bước 8 — Điền thông tin

| Trường | Giá trị |
|---|---|
| **Tên kết nối** | Tên tùy ý, VD: `Messenger Fanpage chính` |
| **Knowledge Base ID** | ID của Knowledge Base chatbot sẽ dùng để trả lời |
| **Page ID** | Dãy số lấy ở Bước 5 |
| **Page Access Token** | Token lấy ở Bước 3 |
| **App Secret** | Secret lấy ở Bước 4 |
| **Verify Token** | Chuỗi bạn tự đặt ở Bước 6 |

### Bước 9 — Bấm "Kết nối"

Sau khi lưu thành công, bấm lại vào card Messenger → modal hiển thị **Webhook URL** có dạng:

```
https://your-domain.com/webhooks/messenger/<integrationId>
```

Copy URL này để dùng ở bước tiếp theo.

> **Lưu ý:** URL phải là **HTTPS public** — Meta không chấp nhận `localhost` hay HTTP.
> Dùng [ngrok](https://ngrok.com) hoặc Cloudflare Tunnel khi dev local.

---

## Phần III — Đăng ký Webhook trên Meta

### Bước 10 — Cấu hình Webhook

1. Quay lại Meta App Dashboard → **Messenger** → **Settings**
2. Tìm mục **Webhooks** → **Add Callback URL**
3. Điền:
   - **Callback URL**: Webhook URL vừa copy (Bước 9)
   - **Verify Token**: Chuỗi bạn đặt ở Bước 6

### Bước 11 — Verify Webhook

Bấm **Verify and Save**. Meta sẽ gửi GET request:

```
GET /webhooks/messenger/<integrationId>
  ?hub.mode=subscribe
  &hub.verify_token=<verify_token>
  &hub.challenge=<random_number>
```

Server trả về `hub.challenge` nếu `verify_token` khớp → Meta xác nhận thành công.

**Nếu verify thất bại**, kiểm tra:
- Webhook URL đúng chưa (đặc biệt `integrationId` ở cuối)
- `Verify Token` trong CMS và Meta phải khớp hoàn toàn (phân biệt hoa/thường)
- Server đang chạy và có thể truy cập từ internet

### Bước 12 — Subscribe Events

Sau khi verify thành công, trong mục **Webhook Fields** → tích chọn:
- ✅ `messages` — nhận tin nhắn văn bản
- ✅ `messaging_postbacks` *(tuỳ chọn)*

### Bước 13 — Subscribe Page vào Webhook

1. Vào **Access Tokens** → chọn Page → **Add Subscriptions**
2. Tích `messages` → **Save**

---

## Phần IV — Kiểm tra hoạt động

### Bước 14 — Test bằng Facebook Test User

1. Trong App Dashboard → **Roles** → **Test Users** → tạo test user
2. Dùng test user đó nhắn tin vào Facebook Page
3. Kiểm tra log server:

```bash
# Xem log API
pnpm dev:api

# Kỳ vọng thấy:
# [MessengerController] Enqueued Messenger job: psid=XXXX
# [MessengerProcessor] Messenger reply sent: psid=XXXX source=rag
```

4. Nếu bot trả lời trong Messenger → kết nối thành công ✅

### Bước 15 — Bật kênh trong CMS

Vào card Messenger trong trang Tích hợp → bật **Toggle** (góc phải card) để kênh hoạt động.

---

## Phần V — Đưa lên Production

### Bước 16 — Chuyển App sang Live Mode

App ở **Development Mode** chỉ hoạt động với **Admin, Developer, Tester** của app.  
Để public users dùng được:

1. App Dashboard → **App Review** → hoàn tất review
2. Hoặc: **Settings** → **Basic** → chuyển **App Mode** sang **Live**
3. Bổ sung **Privacy Policy URL** (bắt buộc khi Live)

### Bước 17 — Đổi sang Long-lived Page Access Token

Token ngắn hạn hết hạn sau ~1 giờ. Xem **Phụ lục A** để đổi sang token không hết hạn.

### Bước 18 — Cập nhật token trong CMS

1. Bấm vào card Messenger → modal → nhập **Page Access Token** mới → **Lưu thay đổi**
2. Token cũ sẽ bị ghi đè (mã hóa AES-256-GCM trước khi lưu DB)

---

## Xử lý sự cố thường gặp

### Bot không trả lời

| Triệu chứng | Nguyên nhân | Giải pháp |
|---|---|---|
| Webhook verify thất bại | `Verify Token` không khớp | Kiểm tra lại giá trị trong CMS và Meta |
| `400 Invalid signature` | `App Secret` sai | Copy lại App Secret từ Meta → Settings → Basic |
| Bot không reply | `Page Access Token` hết hạn hoặc sai | Đổi sang long-lived token (Phụ lục A) |
| Bot không reply | Page chưa subscribe webhook | Bước 13: Add Subscriptions cho Page |
| Bot không reply | App ở Development Mode, user không phải tester | Thêm user vào App Roles hoặc chuyển sang Live |
| `403 Forbidden` khi verify | Webhook URL không khớp `integrationId` | Copy lại URL từ modal CMS |
| Timeout | Server xử lý > 5 giây | Đảm bảo BullMQ worker chạy: `pnpm dev:api` |

### Kiểm tra nhanh webhook thủ công

```bash
# Simulate Meta verify request
curl -X GET "https://your-domain.com/webhooks/messenger/<integrationId>" \
  -G \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=my-chatbot-verify-token-2024" \
  --data-urlencode "hub.challenge=CHALLENGE_ACCEPTED"

# Kỳ vọng: trả về "CHALLENGE_ACCEPTED"
```

---

## Phụ lục A — Đổi sang Long-lived Page Access Token

Short-lived User Token chỉ sống ~1 giờ. Để lấy Page Access Token không hết hạn:

**Bước 1:** Đổi short-lived User Token sang long-lived User Token (sống 60 ngày):

```
GET https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=<APP_ID>
  &client_secret=<APP_SECRET>
  &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>
```

**Bước 2:** Từ long-lived User Token, lấy Page Access Token (không hết hạn):

```
GET https://graph.facebook.com/me/accounts
  ?access_token=<LONG_LIVED_USER_TOKEN>
```

Response trả về danh sách Pages, mỗi page có `access_token` — đây là **Page Access Token không hết hạn** (miễn là user không revoke quyền).

**Bước 3:** Copy `access_token` của Page tương ứng → cập nhật vào CMS.

---

## Phụ lục B — Giới hạn kỹ thuật

| Tiêu chí | Giá trị |
|---|---|
| Độ dài tối đa / tin nhắn | 640 ký tự (tự động split) |
| Timeout webhook Meta chờ | 5 giây |
| Xử lý trong server | Async (BullMQ) — không ảnh hưởng timeout |
| Typing indicator | Hiển thị ngay khi nhận tin, trước khi AI xử lý |
| Event được xử lý | `message.text` — bỏ qua attachment, sticker, echo |
| Bảo mật token | AES-256-GCM, lưu DB dưới dạng mã hóa |
| Xác thực webhook | HMAC-SHA256 (`X-Hub-Signature-256`) |
