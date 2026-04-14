# Hướng dẫn Triển khai Chatbot Platform

**Phiên bản:** 1.0  
**Cập nhật:** 2026-04-09  
**Stack:** NestJS (API) + Next.js (CMS) + PostgreSQL/pgvector + Redis + Ollama

---

## Mục lục

1. [Kiến trúc triển khai](#1-kiến-trúc-triển-khai)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Triển khai Local (Development)](#3-triển-khai-local-development)
4. [Triển khai Production lên Server (VPS/Ubuntu)](#4-triển-khai-production-lên-server-vpsubuntu)
5. [Cấu hình Nginx + SSL](#5-cấu-hình-nginx--ssl)
6. [Quản lý API Key để tích hợp bên ngoài](#6-quản-lý-api-key-để-tích-hợp-bên-ngoài)
7. [Hướng dẫn tích hợp cho hệ thống bên ngoài](#7-hướng-dẫn-tích-hợp-cho-hệ-thống-bên-ngoài)
8. [Biến môi trường đầy đủ](#8-biến-môi-trường-đầy-đủ)
9. [Monitoring & Bảo trì](#9-monitoring--bảo-trì)
10. [Xử lý sự cố thường gặp](#10-xử-lý-sự-cố-thường-gặp)

---

## 1. Kiến trúc triển khai

```
Internet
   │
   ▼
[Nginx / Reverse Proxy]  ← SSL termination, rate limiting
   │
   ├──► :3000  [CMS Frontend — Next.js]   ← Admin nội bộ
   │
   └──► :4000  [API Backend — NestJS]     ← Public endpoint cho bên ngoài
              │
              ├──► PostgreSQL (pgvector)  ← Lưu trữ dữ liệu + vector embeddings
              ├──► Redis                  ← Queue (BullMQ) + cache embeddings
              └──► Ollama                 ← LLM inference + embedding (prod)
                   hoặc Groq API          ← LLM inference (dev/fallback)
```

**Luồng tích hợp cho hệ thống bên ngoài:**
```
Hệ thống bên ngoài
       │
       │  POST /api/v1/chat
       │  Authorization: Bearer {API_KEY}
       ▼
   NestJS API ──► RAG pipeline ──► LLM ──► response
```

---

## 2. Yêu cầu hệ thống

### Server Production (tối thiểu)

| Tài nguyên | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB (nếu dùng Ollama local) |
| Disk | 20 GB | 50 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> Nếu dùng **Groq API** (cloud) thay Ollama: RAM 4 GB là đủ.  
> Nếu dùng **Ollama local** (llama3.1:8b): cần ít nhất 8 GB RAM.

### Phần mềm cần cài trên server

- Docker Engine 24+
- Docker Compose v2
- Node.js 22.x + pnpm 10.x (chỉ cần nếu build tại server)
- Nginx 1.24+
- Certbot (Let's Encrypt SSL)

---

## 3. Triển khai Local (Development)

### 3.1 Chuẩn bị

```bash
# Clone repo
git clone <repo-url> chatbot-platform
cd chatbot-platform

# Cài dependencies
pnpm install

# Tạo file .env từ template
cp .env.example .env
# → Mở .env và điền đầy đủ các biến (xem Mục 8)
```

### 3.2 Khởi động services nền

```bash
# Khởi động PostgreSQL, Redis, Ollama
docker-compose up -d

# Kiểm tra containers đang chạy
docker-compose ps
```

### 3.3 Khởi tạo database

```bash
# Chạy migrations
pnpm db:migrate

# Kích hoạt pgvector extension (chạy 1 lần duy nhất)
docker exec -it <postgres-container-name> psql -U postgres -d chatbot_db -c "
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
  CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
"

# Tạo admin user mặc định
pnpm db:seed
# Tài khoản: admin@chatbot.local / Admin@123456
```

### 3.4 Pull models Ollama (cho embedding)

```bash
# Dùng cho embedding (bắt buộc dù dev hay prod)
docker exec -it <ollama-container-name> ollama pull nomic-embed-text

# Chỉ cần nếu AI_PROVIDER=ollama
docker exec -it <ollama-container-name> ollama pull llama3.1:8b
```

### 3.5 Khởi động ứng dụng

```bash
# Chạy cả API + CMS
pnpm dev

# Hoặc chạy riêng từng service
pnpm dev:api   # API tại http://localhost:4000
pnpm dev:cms   # CMS tại http://localhost:3000
```

### 3.6 Kiểm tra

```bash
# Health check API
curl http://localhost:4000

# Đăng nhập CMS
# Mở trình duyệt: http://localhost:3000
# Dùng: admin@chatbot.local / Admin@123456
```

---

## 4. Triển khai Production lên Server (VPS/Ubuntu)

### 4.1 Cài đặt môi trường server

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra Docker
docker --version          # Docker version 24+
docker compose version    # Docker Compose v2+

# Cài Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Cài Node.js 22 + pnpm (để build)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm@10
```

### 4.2 Đưa code lên server

**Cách 1 — Git pull (khuyến nghị)**
```bash
# Trên server
mkdir -p /opt/chatbot
cd /opt/chatbot
git clone <repo-url> .
```

**Cách 2 — rsync từ máy local**
```bash
# Chạy từ máy local
rsync -avz --exclude node_modules --exclude .git \
  ./ user@your-server-ip:/opt/chatbot/
```

### 4.3 Tạo file `docker-compose.prod.yml`

Tạo file `/opt/chatbot/docker-compose.prod.yml`:

```yaml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-chatbot_db}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Không expose port ra ngoài — chỉ internal network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    restart: always
    volumes:
      - ollama_data:/root/.ollama
    # Chỉ accessible từ internal network

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    restart: always
    ports:
      - "4000:4000"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-chatbot_db}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      API_PORT: 4000
      CMS_URL: ${CMS_URL}
      AI_PROVIDER: ${AI_PROVIDER:-ollama}
      GROQ_API_KEY: ${GROQ_API_KEY}
      GROQ_MODEL: ${GROQ_MODEL:-llama-3.1-8b-instant}
      OLLAMA_BASE_URL: http://ollama:11434
      OLLAMA_MODEL: ${OLLAMA_MODEL:-llama3.1:8b}
      OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL:-nomic-embed-text}
      UPLOAD_DIR: /app/uploads
      MAX_FILE_SIZE_MB: ${MAX_FILE_SIZE_MB:-10}
      NODE_ENV: production
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  cms:
    build:
      context: ./apps/cms
      dockerfile: Dockerfile
    restart: always
    ports:
      - "3000:3000"
    environment:
      NEXTAUTH_URL: ${NEXTAUTH_URL}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
      NODE_ENV: production
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
  ollama_data:
  uploads_data:
```

### 4.4 Tạo Dockerfile cho API

Tạo file `/opt/chatbot/apps/api/Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY packages/ ./packages/

# Copy API source
COPY apps/api/package.json ./apps/api/
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

COPY apps/api/ ./apps/api/

# Generate Prisma client
RUN cd apps/api && pnpm exec prisma generate

# Build
RUN cd apps/api && pnpm build

# ---- Production image ----
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

RUN mkdir -p /app/uploads

EXPOSE 4000
CMD ["node", "dist/main"]
```

### 4.5 Tạo Dockerfile cho CMS

Tạo file `/opt/chatbot/apps/cms/Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/ ./packages/

COPY apps/cms/package.json ./apps/cms/
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

COPY apps/cms/ ./apps/cms/

RUN cd apps/cms && pnpm build

# ---- Production image ----
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/apps/cms/.next ./.next
COPY --from=builder /app/apps/cms/public ./public
COPY --from=builder /app/apps/cms/package.json ./
COPY --from=builder /app/apps/cms/node_modules ./node_modules

EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

### 4.6 Tạo file `.env` production

Tạo file `/opt/chatbot/.env` (không commit vào git):

```bash
# === DATABASE ===
POSTGRES_DB=chatbot_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<mật-khẩu-mạnh-ngẫu-nhiên>

# === REDIS ===
REDIS_PASSWORD=<mật-khẩu-redis-ngẫu-nhiên>

# === AUTH ===
JWT_SECRET=<chuỗi-ngẫu-nhiên-64-chars>
NEXTAUTH_SECRET=<chuỗi-ngẫu-nhiên-32-chars>
NEXTAUTH_URL=https://cms.yourdomain.com

# === URL ===
CMS_URL=https://cms.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# === AI (chọn 1) ===
# Option A: Groq (đơn giản hơn, không cần GPU)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant

# Option B: Ollama (self-hosted, cần RAM cao)
# AI_PROVIDER=ollama
# OLLAMA_MODEL=llama3.1:8b
# OLLAMA_EMBED_MODEL=nomic-embed-text

# === UPLOAD ===
MAX_FILE_SIZE_MB=10
```

> **Tạo secret ngẫu nhiên:**
> ```bash
> openssl rand -base64 48   # JWT_SECRET
> openssl rand -base64 32   # NEXTAUTH_SECRET
> openssl rand -hex 16      # POSTGRES_PASSWORD
> ```

### 4.7 Khởi động production stack

```bash
cd /opt/chatbot

# Build images
docker compose -f docker-compose.prod.yml build

# Khởi động tất cả services
docker compose -f docker-compose.prod.yml up -d

# Kiểm tra trạng thái
docker compose -f docker-compose.prod.yml ps

# Xem logs
docker compose -f docker-compose.prod.yml logs -f api
```

### 4.8 Khởi tạo database lần đầu

```bash
# Chạy migrations trong container api
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy

# Kích hoạt pgvector (chạy 1 lần)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d chatbot_db -c "
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
      ON chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  "

# Seed admin user
docker compose -f docker-compose.prod.yml exec api \
  npx ts-node ../../packages/database/seed.ts
```

### 4.9 Pull Ollama models (nếu dùng Ollama)

```bash
docker compose -f docker-compose.prod.yml exec ollama \
  ollama pull nomic-embed-text

# Chỉ cần nếu AI_PROVIDER=ollama
docker compose -f docker-compose.prod.yml exec ollama \
  ollama pull llama3.1:8b
```

---

## 5. Cấu hình Nginx + SSL

### 5.1 Tạo config Nginx

Tạo file `/etc/nginx/sites-available/chatbot`:

```nginx
# === API Backend ===
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Streaming SSE support
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    # Upload file size
    client_max_body_size 15M;
}

# === CMS Frontend ===
server {
    listen 80;
    server_name cms.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5.2 Kích hoạt và lấy SSL

```bash
# Kích hoạt site
sudo ln -s /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Lấy SSL certificate (thay yourdomain.com bằng domain thực)
sudo certbot --nginx \
  -d api.yourdomain.com \
  -d cms.yourdomain.com \
  --non-interactive \
  --agree-tos \
  -m your@email.com

# Certbot tự động cập nhật config Nginx với SSL
# Kiểm tra
sudo nginx -t && sudo systemctl reload nginx
```

### 5.3 Kiểm tra SSL auto-renewal

```bash
sudo certbot renew --dry-run
```

---

## 6. Quản lý API Key để tích hợp bên ngoài

### 6.1 Tạo API Key qua CMS

1. Đăng nhập CMS tại `https://cms.yourdomain.com`
2. Vào menu **API Keys**
3. Click **"Tạo API Key mới"**
4. Điền thông tin:
   - **Tên:** tên nhận diện (VD: "Website chính", "App mobile")
   - **Allowed Origins:** danh sách domain được phép gọi API (VD: `https://mywebsite.com`)
   - **Rate Limit:** số request/giờ (mặc định 100)
5. Sao chép API key hiển thị — **key chỉ hiển thị 1 lần**

### 6.2 Tạo API Key qua REST API (programmatic)

```bash
# Đăng nhập lấy JWT token
TOKEN=$(curl -s -X POST https://api.yourdomain.com/cms/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@chatbot.local","password":"Admin@123456"}' \
  | jq -r '.access_token')

# Tạo API key
curl -X POST https://api.yourdomain.com/cms/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Website bán hàng",
    "knowledgeBaseId": "<kb-id>",
    "allowedOrigins": ["https://myshop.com"],
    "rateLimit": 200
  }'
```

Response:
```json
{
  "id": "clx...",
  "name": "Website bán hàng",
  "key": "cb_live_xxxxxxxxxxxxxxxxxxxx",
  "isActive": true,
  "rateLimit": 200,
  "allowedOrigins": ["https://myshop.com"]
}
```

### 6.3 Thu hồi API Key

```bash
curl -X PATCH https://api.yourdomain.com/cms/api-keys/{id}/revoke \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Hướng dẫn tích hợp cho hệ thống bên ngoài

Các hệ thống bên ngoài giao tiếp với chatbot qua **một endpoint duy nhất**:

```
POST https://api.yourdomain.com/api/v1/chat
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

### 7.1 Chat không streaming

**Request:**
```json
{
  "message": "Sản phẩm của bạn có bảo hành không?",
  "session_id": "user-123-session-abc",
  "stream": false
}
```

- `session_id`: tuỳ chọn — nếu không truyền, server tạo session mới
- `message`: câu hỏi của người dùng (tiếng Việt)
- `stream`: `false` để nhận response 1 lần

**Response:**
```json
{
  "session_id": "clx...",
  "message": {
    "role": "assistant",
    "content": "Có, tất cả sản phẩm đều được bảo hành 12 tháng..."
  },
  "latency_ms": 850
}
```

**Ví dụ cURL:**
```bash
curl -X POST https://api.yourdomain.com/api/v1/chat \
  -H "Authorization: Bearer cb_live_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Thời gian giao hàng bao lâu?",
    "session_id": "user-001",
    "stream": false
  }'
```

### 7.2 Chat streaming (Server-Sent Events)

**Request:**
```json
{
  "message": "Giải thích chính sách đổi trả",
  "session_id": "user-123",
  "stream": true
}
```

**Response** (`text/event-stream`):
```
data: {"delta": "Chính ", "done": false}
data: {"delta": "sách ", "done": false}
data: {"delta": "đổi trả ", "done": false}
data: {"delta": "của chúng tôi...", "done": false}
data: {"delta": "", "done": true, "session_id": "clx..."}
```

**Ví dụ JavaScript (Browser/Node.js):**
```javascript
async function chatStream(message, sessionId) {
  const response = await fetch('https://api.yourdomain.com/api/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer cb_live_xxxx',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      stream: true,
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = JSON.parse(line.replace('data: ', ''));
      if (!data.done) {
        fullText += data.delta;
        // Cập nhật UI ở đây
        console.log(data.delta);
      }
    }
  }

  return fullText;
}
```

**Ví dụ Python:**
```python
import requests
import json

def chat(message: str, session_id: str | None = None) -> str:
    response = requests.post(
        'https://api.yourdomain.com/api/v1/chat',
        headers={
            'Authorization': 'Bearer cb_live_xxxx',
            'Content-Type': 'application/json',
        },
        json={
            'message': message,
            'session_id': session_id,
            'stream': False,
        }
    )
    response.raise_for_status()
    data = response.json()
    return data['message']['content'], data['session_id']

# Dùng
answer, session_id = chat('Bảo hành bao lâu?')
print(answer)

# Hỏi tiếp trong cùng session
answer2, _ = chat('Còn linh kiện thì sao?', session_id=session_id)
```

**Ví dụ PHP:**
```php
<?php
function chatWithBot(string $message, ?string $sessionId = null): array {
    $data = [
        'message' => $message,
        'stream'  => false,
    ];
    if ($sessionId) $data['session_id'] = $sessionId;

    $ch = curl_init('https://api.yourdomain.com/api/v1/chat');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer cb_live_xxxx',
            'Content-Type: application/json',
        ],
    ]);

    $result = curl_exec($ch);
    curl_close($ch);

    return json_decode($result, true);
}

$res = chatWithBot('Chính sách hoàn tiền?');
echo $res['message']['content'];
```

### 7.3 Nhúng widget vào website (HTML đơn giản)

```html
<!-- Thêm vào cuối <body> -->
<div id="chatbot-widget"></div>
<script>
(function() {
  const API_URL = 'https://api.yourdomain.com/api/v1/chat';
  const API_KEY = 'cb_live_xxxx';
  let sessionId = null;

  // Tạo UI cơ bản
  const widget = document.getElementById('chatbot-widget');
  widget.innerHTML = `
    <div style="position:fixed;bottom:20px;right:20px;width:350px;
                border:1px solid #ccc;border-radius:12px;
                background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.15);">
      <div id="chat-messages" style="height:300px;overflow-y:auto;padding:16px;"></div>
      <div style="padding:12px;border-top:1px solid #eee;display:flex;gap:8px;">
        <input id="chat-input" type="text" placeholder="Nhập câu hỏi..."
               style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;">
        <button onclick="sendMessage()"
                style="padding:8px 16px;background:#2563eb;color:#fff;
                       border:none;border-radius:6px;cursor:pointer;">Gửi</button>
      </div>
    </div>
  `;

  window.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    appendMessage('user', message);
    input.value = '';

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, session_id: sessionId, stream: false }),
    });

    const data = await res.json();
    sessionId = data.session_id;
    appendMessage('assistant', data.message.content);
  };

  function appendMessage(role, content) {
    const el = document.getElementById('chat-messages');
    el.innerHTML += `
      <div style="margin:8px 0;text-align:${role === 'user' ? 'right' : 'left'}">
        <span style="display:inline-block;padding:8px 12px;border-radius:8px;
                     background:${role === 'user' ? '#2563eb' : '#f3f4f6'};
                     color:${role === 'user' ? '#fff' : '#111'};max-width:80%;">
          ${content}
        </span>
      </div>`;
    el.scrollTop = el.scrollHeight;
  }
})();
</script>
```

### 7.4 Xử lý lỗi

| HTTP Status | Ý nghĩa | Xử lý |
|---|---|---|
| `401 Unauthorized` | API key không hợp lệ hoặc đã bị revoke | Kiểm tra lại key |
| `403 Forbidden` | Origin không được phép | Thêm origin vào `allowedOrigins` |
| `429 Too Many Requests` | Vượt rate limit | Chờ reset (mỗi giờ), hoặc tăng `rateLimit` |
| `503 Service Unavailable` | AI provider đang bận | Retry sau vài giây |
| `400 Bad Request` | Request body sai format | Kiểm tra `message` field |

---

## 8. Biến môi trường đầy đủ

### API (`apps/api/.env`)

```bash
# Database
DATABASE_URL="postgresql://postgres:<password>@localhost:5434/chatbot_db"

# Redis
REDIS_URL="redis://:<redis-password>@localhost:6379"

# Auth
JWT_SECRET="<chuỗi-ngẫu-nhiên-64-chars>"

# AI — chọn 1 trong 2
AI_PROVIDER="groq"              # hoặc "ollama"
GROQ_API_KEY="gsk_..."
GROQ_MODEL="llama-3.1-8b-instant"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.1:8b"
OLLAMA_EMBED_MODEL="nomic-embed-text"

# Server
API_PORT=4000
CMS_URL="http://localhost:3000"   # origin được phép gọi CMS endpoints

# File upload
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE_MB=10
```

### CMS (`apps/cms/.env.local`)

```bash
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<chuỗi-ngẫu-nhiên-32-chars>"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

---

## 9. Monitoring & Bảo trì

### 9.1 Xem logs

```bash
# Logs realtime
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f cms

# 100 dòng gần nhất
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

### 9.2 Backup database

```bash
#!/bin/bash
# Tạo file: /opt/chatbot/scripts/backup-db.sh
BACKUP_DIR="/opt/chatbot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker compose -f /opt/chatbot/docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres chatbot_db | gzip > $BACKUP_DIR/chatbot_db_$DATE.sql.gz

# Giữ 7 ngày
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
echo "Backup done: chatbot_db_$DATE.sql.gz"
```

```bash
chmod +x /opt/chatbot/scripts/backup-db.sh

# Chạy tự động hàng ngày lúc 2h sáng
echo "0 2 * * * /opt/chatbot/scripts/backup-db.sh" | crontab -
```

### 9.3 Khởi động lại services

```bash
# Restart 1 service
docker compose -f docker-compose.prod.yml restart api

# Restart toàn bộ
docker compose -f docker-compose.prod.yml restart
```

### 9.4 Update ứng dụng

```bash
cd /opt/chatbot

# Pull code mới
git pull origin master

# Build lại images
docker compose -f docker-compose.prod.yml build api cms

# Chạy migrations (nếu có schema thay đổi)
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Restart services
docker compose -f docker-compose.prod.yml up -d --no-deps api cms
```

### 9.5 Kiểm tra sức khoẻ hệ thống

```bash
# API health check
curl https://api.yourdomain.com

# Kiểm tra Redis
docker compose -f docker-compose.prod.yml exec redis \
  redis-cli -a $REDIS_PASSWORD ping

# Kiểm tra PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  pg_isready -U postgres

# Kiểm tra Ollama (nếu dùng)
docker compose -f docker-compose.prod.yml exec ollama \
  ollama list
```

---

## 10. Xử lý sự cố thường gặp

### Lỗi: `pgvector extension not found`
```bash
docker compose exec postgres psql -U postgres -d chatbot_db \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Lỗi: `ECONNREFUSED redis`
- Kiểm tra `REDIS_URL` trong `.env` — URL phải khớp với service name trong docker-compose
- Trong docker-compose: dùng `redis://redis:6379` (không phải `localhost`)

### Lỗi: API Key bị reject dù key đúng
1. Kiểm tra `isActive = true` trong DB
2. Kiểm tra `allowedOrigins` — request origin phải nằm trong danh sách
3. Nếu test bằng curl/postman: không có `Origin` header → backend cho phép qua

### Lỗi: Streaming không hoạt động qua Nginx
- Đảm bảo có trong Nginx config:
  ```nginx
  proxy_buffering off;
  proxy_cache off;
  chunked_transfer_encoding on;
  proxy_read_timeout 300s;
  ```

### Lỗi: File upload thất bại
- Kiểm tra `MAX_FILE_SIZE_MB` trong `.env`
- Kiểm tra `client_max_body_size` trong Nginx config
- Kiểm tra quyền ghi vào thư mục `UPLOAD_DIR`

### Lỗi: Ollama model không load được
```bash
# Kiểm tra model đã pull chưa
docker compose exec ollama ollama list

# Pull lại nếu thiếu
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.1:8b
```

### Xem document indexing bị lỗi
```bash
# Kiểm tra document status trong DB
docker compose exec postgres psql -U postgres -d chatbot_db \
  -c "SELECT id, filename, status, error_message FROM documents ORDER BY created_at DESC LIMIT 10;"
```
