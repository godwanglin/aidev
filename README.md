# AI Gateway & Proxy Platform (Next.js + Prisma + MySQL)

Platform AI Gateway berkinerja tinggi sebagai proxy aman dan load balancer multi-provider AI (OpenAI, Anthropic, Gemini, Codex, Antigravity, dll).

## Fitur Utama
1. **Internal API Key Management**:
   - Generate API key internal (`sk-int-xxxxxxxxxxxxxxxx`) yang disimpan dalam format hash SHA-256 di database MySQL.
   - Dashboard untuk membuat, memantau, dan me-revoke API key secara instan.
   - Fitur sliding-window rate limit per key.
2. **OpenAI-Compatible Proxy (`/v1/*`)**:
   - Catch-all route handler (`/v1/[...path]`).
   - Otomatis memvalidasi Bearer internal token dan meneruskan request ke upstream dengan API key server rahasia.
   - **Full Streaming Support (SSE)** dengan capture usage token secara non-blocking di background.
3. **Usage & Analytics Tracking**:
   - Logging otomatis setiap request (path, method, status code, model, token count, duration latency).
   - Dashboard real-time untuk memantau trafik, biaya estimasi, dan error rate.

## Environment Variables (.env)
```env
DATABASE_URL="mysql://root:password@localhost:3306/aigateway"
# UPSTREAM_BASE_URL=""
# UPSTREAM_API_KEY=""
INTERNAL_KEY_PREFIX="sk-int-"
PORT=3000
```

## Cara Penggunaan Client / SDK
Cukup arahkan Base URL OpenAI SDK atau HTTP client ke gateway lokal:

- **Base URL**: `http://localhost:3000/v1`
- **Authorization**: `Bearer <YOUR_INTERNAL_API_KEY>`

Contoh cURL:
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-int-xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role": "user", "content": "Halo AI!"}],
    "max_tokens": 50
  }'
```
