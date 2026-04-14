# Phân tích & Phương án: Tích hợp Chatbot với Bên Thứ 3

> Ngày: 2026-04-13  
> Phạm vi: Website Embed · Facebook Messenger · Zalo OA

---

## 1. Tổng quan kiến trúc hiện tại

```
Client → POST /api/v1/chat (Bearer: API Key)
           ↓
       ApiKeyGuard  →  ChatService  →  RAG + AI  →  Response (stream / json)
```

**Điểm mạnh cần tận dụng:**

- `Session` model đã có `externalUserId` — dùng để định danh user từ bên ngoài.
- `ApiKey` có `knowledgeBaseId` — mỗi kênh tích hợp dùng API key riêng → gắn KB riêng.
- `ChatService.chat()` trả về cả stream lẫn non-stream — webhook adapter chỉ cần dùng non-stream.

**Hạn chế cần giải quyết:**

- API key dùng `Bearer` header → các platform gửi webhook không hỗ trợ tự thêm header → cần endpoint webhook riêng, xác thực theo cơ chế của từng platform.
- Stream (SSE) không phù hợp với webhook (platform cần nhận đủ câu trả lời mới gửi lại).
- Chưa có nơi lưu cấu hình tích hợp (token, webhook secret, v.v.).

---

## 2. Thiết kế tổng thể

### 2.1 Mô hình Channel Adapter

```
Platform Webhook
      │
      ▼
[Channel Controller]   ← xác thực chữ ký của platform
      │
      ▼
[Channel Adapter]      ← chuẩn hóa message vào/ra
      │
      ▼
[ChatService.chatInternal()]  ← tái sử dụng logic hiện tại (non-stream)
      │
      ▼
[Channel Adapter]      ← format response theo platform
      │
      ▼
[Platform API Client]  ← gọi API platform để gửi trả lời
```

Mỗi kênh là một **Adapter** độc lập, dùng chung `ChatService` lõi.

### 2.2 Thay đổi Database Schema

Thêm 2 model vào `packages/database/schema.prisma`:

```prisma
model ChannelIntegration {
  id              String          @id @default(cuid())
  knowledgeBaseId String
  channel         ChannelType
  name            String          // tên hiển thị trên CMS
  isActive        Boolean         @default(true)
  config          Json            // token, secret, page_id, v.v. (encrypted)
  webhookSecret   String?         // để verify chữ ký webhook
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  knowledgeBase   KnowledgeBase   @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  sessions        Session[]

  @@unique([knowledgeBaseId, channel])
  @@map("channel_integrations")
}

enum ChannelType {
  WEBSITE
  MESSENGER
  ZALO
  SLACK
}
```

Sửa model `Session` — thêm:

```prisma
  channelIntegrationId String?
  channel              ChannelType?

  channelIntegration  ChannelIntegration? @relation(...)
```

### 2.3 Sửa ChatService — tách `chatInternal()`

Thêm method `chatInternal()` không phụ thuộc vào `ApiKey`, nhận thẳng `knowledgeBaseId` và `channelIntegrationId`:

```typescript
async chatInternal(params: {
  message: string;
  sessionId?: string;
  externalUserId: string;
  knowledgeBaseId: string;
  channelIntegrationId: string;
}): Promise<{ session_id: string; content: string; latency_ms: number }>
```

`ChatService.chat()` hiện tại (dùng API key) vẫn giữ nguyên, gọi nội bộ `chatInternal()`.

---

## 3. Kênh 1: Website Embed Widget

### 3.1 Cơ chế

Sử dụng API key + endpoint hiện tại (`/api/v1/chat`). Cần thêm:

- **JavaScript widget** nhúng vào website khách hàng qua 1 thẻ `<script>`.
- Widget tự quản lý `session_id` trong `localStorage`.
- Hỗ trợ stream (SSE) để hiển thị chữ chạy từng từ.

### 3.2 Cách nhúng

```html
<!-- Khách hàng chỉ cần thêm 2 dòng này vào website -->
<script>
  window.ChatbotConfig = {
    apiKey: "sk-xxx",
    theme: "light",
    position: "bottom-right",
  };
</script>
<script src="https://yourplatform.com/widget/chatbot.js" async></script>
```

### 3.3 File cần tạo

| File                                               | Mô tả                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| `apps/widget/`                                     | Dự án Next.js / Vite standalone build ra `chatbot.js` |
| `apps/widget/src/ChatWidget.tsx`                   | UI floating button + chat box                         |
| `apps/widget/src/api.ts`                           | Gọi `/api/v1/chat` stream                             |
| `apps/api/src/modules/widget/widget.controller.ts` | Serve `chatbot.js` + CORS                             |

### 3.4 Không cần thay đổi schema

Dùng `ApiKey.allowedOrigins` để giới hạn domain nhúng widget — đã có sẵn.

---

## 4. Kênh 2: Facebook Messenger

### 4.1 Cơ chế hoạt động

```
User nhắn tin FB Page
      │
      ▼ (webhook POST)
POST /webhooks/messenger/:integrationId
      │
MessengerAdapter.verify()   ← HMAC-SHA256 với App Secret
      │
MessengerAdapter.handleMessage()
      │
ChatService.chatInternal()
      │
MessengerClient.sendMessage()  ← Graph API /me/messages
```

### 4.2 Luồng xác minh webhook (khi admin thiết lập)

Meta yêu cầu verify URL webhook 1 lần bằng `GET` request:

```
GET /webhooks/messenger/:integrationId
  ?hub.mode=subscribe
  &hub.verify_token=<token_admin_đặt>
  &hub.challenge=<số ngẫu nhiên>
```

Controller trả về `hub.challenge` nếu `verify_token` khớp với config.

### 4.3 Config lưu trong `ChannelIntegration.config`

```json
{
  "pageId": "123456789",
  "pageAccessToken": "EAABsbCS...",
  "appSecret": "abc123...",
  "verifyToken": "my-verify-token"
}
```

### 4.4 Xử lý đặc thù Messenger

- User ID: `sender.id` từ webhook payload → lưu vào `Session.externalUserId`.
- Typing indicator: gửi `sender_action: "typing_on"` trước khi trả lời.
- Giới hạn 640 ký tự/tin → tự động split nếu response dài.
- Message type: chỉ xử lý `message.text`, bỏ qua attachment/sticker.

### 4.5 Endpoints cần tạo

```
GET  /webhooks/messenger/:integrationId   ← webhook verification
POST /webhooks/messenger/:integrationId   ← nhận tin nhắn
```

---

## 5. Kênh 3: Zalo Official Account

### 5.1 Cơ chế hoạt động

```
User nhắn tin Zalo OA
      │
      ▼ (webhook POST)
POST /webhooks/zalo/:integrationId
      │
ZaloAdapter.verify()   ← MAC signature với OA Secret Key
      │
ZaloAdapter.handleMessage()
      │
ChatService.chatInternal()
      │
ZaloClient.sendMessage()  ← Zalo API /message/cs
```

### 5.2 Config lưu trong `ChannelIntegration.config`

```json
{
  "oaId": "1234567890",
  "accessToken": "eXlBbG...",
  "secretKey": "zalo-secret-key"
}
```

### 5.3 Xử lý đặc thù Zalo

- Zalo gửi webhook dạng form-encoded hoặc JSON tùy version API.
- User ID: `sender.id` từ payload → `Session.externalUserId`.
- Access token Zalo hết hạn sau 3 tháng → cần nhắc admin renew (hoặc dùng refresh token nếu Zalo hỗ trợ).
- Giới hạn 2000 ký tự/tin — ít rủi ro hơn Messenger.
- Cần gọi `POST /message/cs` với `recipient.id` và `message.text`.

### 5.4 Endpoints cần tạo

```
POST /webhooks/zalo/:integrationId   ← nhận tin nhắn (Zalo không có GET verify)
```

Zalo verify bằng MAC trong body, không dùng GET challenge.

---

## 6. Kênh 4: Slack

### 6.1 Cơ chế hoạt động

```
User nhắn tin trong Slack channel / DM
      │
      ▼ (Events API POST)
POST /webhooks/slack/:integrationId
      │
SlackAdapter.verify()   ← HMAC-SHA256 với Signing Secret
      │
SlackAdapter.handleEvent()
      │
ChatService.chatInternal()
      │
SlackClient.postMessage()  ← Web API /chat.postMessage
```

### 6.2 Config lưu trong `ChannelIntegration.config`

```json
{
  "botToken": "xoxb-...",
  "signingSecret": "abc123...",
  "appId": "A12345",
  "botUserId": "U12345"
}
```

### 6.3 Xử lý đặc thù Slack

- **URL Verification**: Slack gửi `challenge` khi cấu hình lần đầu → phải trả về `challenge` ngay lập tức.
- **Tránh vòng lặp**: Bot phải bỏ qua message từ chính nó (`event.bot_id` hoặc `user === botUserId`).
- **Deduplication**: Slack có thể gửi event nhiều lần → lưu `event_id` vào Redis TTL 5 phút.
- User ID: `event.user` → `Session.externalUserId`.
- Hỗ trợ Thread: reply vào `thread_ts` nếu message đến từ thread.
- Markdown: Slack dùng mrkdwn (`*bold*`, `_italic_`) thay vì CommonMark.

### 6.4 Endpoints cần tạo

```
POST /webhooks/slack/:integrationId   ← URL Verification + Events
```

---

## 7. Module NestJS: `integrations`

### 7.1 Cấu trúc file

```
apps/api/src/modules/integrations/
├── integrations.module.ts
├── integrations.service.ts          ← CRUD ChannelIntegration (CMS)
├── integrations.controller.ts       ← GET/POST /cms/integrations
├── webhook.module.ts
├── adapters/
│   ├── base.adapter.ts              ← interface IChannelAdapter
│   ├── messenger.adapter.ts
│   ├── zalo.adapter.ts
│   └── slack.adapter.ts
├── clients/
│   ├── messenger.client.ts          ← gọi Graph API
│   ├── zalo.client.ts               ← gọi Zalo API
│   └── slack.client.ts              ← gọi Slack Web API
├── webhook/
│   ├── messenger.controller.ts      ← /webhooks/messenger/:id
│   ├── zalo.controller.ts           ← /webhooks/zalo/:id
│   └── slack.controller.ts          ← /webhooks/slack/:id
└── dto/
    ├── create-integration.dto.ts
    └── update-integration.dto.ts
```

### 7.2 Interface `IChannelAdapter`

```typescript
interface IChannelAdapter {
  /** Xác thực chữ ký từ platform */
  verifySignature(req: Request): boolean;

  /** Parse payload thành message chuẩn */
  parseIncoming(payload: unknown): IncomingMessage | null;

  /** Gửi trả lời về platform */
  sendReply(
    channelUserId: string,
    text: string,
    config: ChannelConfig,
  ): Promise<void>;
}

interface IncomingMessage {
  channelUserId: string; // ID user trên platform
  text: string;
  sessionHint?: string; // thread_ts (Slack) hoặc dùng channelUserId làm session key
}
```

---

## 8. CMS Admin — Quản lý tích hợp

### 8.1 Trang `/integrations` trong Next.js CMS

```
/integrations
  ├── Danh sách kênh đã tích hợp (card grid)
  ├── Nút "+ Thêm kênh"
  └── Chi tiết từng kênh:
       ├── Trạng thái (Active / Inactive)
       ├── Form điền token/secret
       ├── Webhook URL để copy (tự động sinh)
       └── Nút Test kết nối
```

### 8.2 Endpoints CMS

```
GET    /cms/integrations                  ← danh sách
POST   /cms/integrations                  ← tạo mới
PATCH  /cms/integrations/:id              ← cập nhật config
DELETE /cms/integrations/:id              ← xoá
POST   /cms/integrations/:id/test         ← gửi tin test
```

### 8.3 Bảo mật config

Config nhạy cảm (token, secret key) được mã hóa trước khi lưu DB:

- Dùng `AES-256-GCM` với `ENCRYPTION_KEY` env var.
- Giải mã trong memory khi gọi API platform, không bao giờ trả về raw token qua API CMS.

---

## 9. Lộ trình triển khai

### Phase A — Nền tảng (1 tuần)

| #   | Việc cần làm                                                                   |
| --- | ------------------------------------------------------------------------------ |
| A1  | Thêm migration Prisma: `ChannelIntegration`, `ChannelType` enum, sửa `Session` |
| A2  | Tách `ChatService.chatInternal()` không phụ thuộc ApiKey                       |
| A3  | Tạo `IntegrationsModule` + CRUD + CMS endpoints                                |
| A4  | Trang `/integrations` trên CMS (danh sách + form)                              |
| A5  | Thêm `ENCRYPTION_KEY` env var + util mã hóa/giải mã config                     |

### Phase B — Website Widget (3–4 ngày)

| #   | Việc cần làm                                          |
| --- | ----------------------------------------------------- |
| B1  | Scaffold `apps/widget` (Vite + React + Tailwind)      |
| B2  | Build ra `chatbot.js` single file (bundle <50KB gzip) |
| B3  | UI: floating button, chat box, SSE stream rendering   |
| B4  | Trang hướng dẫn nhúng trên CMS (copy snippet)         |

### Phase C — Messenger (3–4 ngày)

| #   | Việc cần làm                                  |
| --- | --------------------------------------------- |
| C1  | `MessengerAdapter` + `MessengerClient`        |
| C2  | Controller `GET/POST /webhooks/messenger/:id` |
| C3  | Form cấu hình Messenger trên CMS              |
| C4  | Test end-to-end với FB Test User              |

### Phase D — Zalo (3–4 ngày)

| #   | Việc cần làm                         |
| --- | ------------------------------------ |
| D1  | `ZaloAdapter` + `ZaloClient`         |
| D2  | Controller `POST /webhooks/zalo/:id` |
| D3  | Form cấu hình Zalo OA trên CMS       |
| D4  | Test end-to-end với Zalo OA sandbox  |

---

## 10. Yêu cầu hạ tầng

| Yêu cầu                    | Lý do                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **HTTPS public URL**       | Messenger, Zalo, Slack chỉ gọi webhook qua HTTPS. Dev dùng `ngrok` hoặc Cloudflare Tunnel. |
| **ENCRYPTION_KEY** env var | Mã hóa token/secret trong DB                                                               |
| Thêm packages              | `axios` (HTTP client cho platform API), `@slack/web-api` (Slack SDK tùy chọn)              |
| Redis (đã có)              | Deduplication event Slack, rate limit webhook                                              |

---

## 11. So sánh đặc điểm các kênh

| Tiêu chí           | Website Widget   | Messenger                  | Zalo            | Slack                      |
| ------------------ | ---------------- | -------------------------- | --------------- | -------------------------- |
| Xác thực webhook   | API Key (Bearer) | HMAC-SHA256 App Secret     | MAC OA Secret   | HMAC-SHA256 Signing Secret |
| Streaming          | Có (SSE)         | Không                      | Không           | Không                      |
| Giới hạn ký tự/tin | Không giới hạn   | 640                        | 2000            | ~4000                      |
| Token hết hạn      | Không            | Không (page token dài hạn) | ~3 tháng        | Không (bot token)          |
| Sandbox/Test       | API key local    | FB Test User               | Zalo OA sandbox | Workspace test             |
| Độ phức tạp        | Thấp             | Trung bình                 | Trung bình      | Trung bình                 |

---

## 12. Rủi ro & Giải pháp

| Rủi ro                                          | Giải pháp                                                |
| ----------------------------------------------- | -------------------------------------------------------- |
| Webhook timeout (platform chờ tối đa 5–20 giây) | Trả `200 OK` ngay, xử lý async qua BullMQ, gửi reply sau |
| Token Zalo hết hạn                              | Thêm cron check + alert email cho admin                  |
| Bot Slack reply chính nó → vòng lặp vô tận      | Filter `bot_id` và `botUserId` trước khi xử lý           |
| Platform gửi duplicate event                    | Redis deduplication với `event_id`, TTL 5 phút           |
| Lộ token trong log                              | Mask token trong LoggingInterceptor                      |

### Xử lý async cho webhook (quan trọng)

Để tránh timeout, webhook controller phải:

```
POST /webhooks/messenger/:id
  1. Verify chữ ký         ← sync (< 1ms)
  2. Parse payload          ← sync (< 1ms)
  3. Enqueue BullMQ job     ← sync (< 5ms)
  4. Trả về 200 OK          ← ngay lập tức

Worker (async):
  5. chatInternal()         ← AI call (~2–5 giây)
  6. Platform API reply     ← HTTP call (~500ms)
```

---

## 13. Ví dụ webhook payload

### Messenger incoming

```json
{
  "object": "page",
  "entry": [
    {
      "id": "PAGE_ID",
      "messaging": [
        {
          "sender": { "id": "USER_PSID" },
          "recipient": { "id": "PAGE_ID" },
          "timestamp": 1458692752478,
          "message": { "mid": "m_xxx", "text": "Xin chào" }
        }
      ]
    }
  ]
}
```

### Zalo incoming

```json
{
  "app_id": "OA_ID",
  "user_id_by_app": "USER_ID",
  "event_name": "user_send_text",
  "message": { "text": "Xin chào", "msg_id": "xxx" },
  "sender": { "id": "USER_ID", "display_name": "Nguyễn Văn A" },
  "recipient": { "id": "OA_ID" }
}
```
