const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

function decryptCredential(encryptedData) {
  if (!encryptedData) return '';
  const parts = encryptedData.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, cipherHex] = parts;
  const secret = process.env.ENCRYPTION_MASTER_KEY || 'aidev_gateway_default_fallback_secret_key_2026';
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Models from the user screenshot:
const modelsToTest = [
  "glm-5.2",
  "glm-5.1",
  "glm-5.0",
  "glm-5.0-turbo",
  "glm-5v-turbo",
  "glm-4.7",
  "minimax-m3",
  "minimax-m2.7",
  "kimi-k2.7",
  "kimi-k2.6",
  "kimi-k2.5",
  "hy3-preview",
  "deepseek-v4-pro",
  "deepseek-v4.1-flash",
  "deepseek-v3-2-volc"
];

async function testModel(token, model) {
  const url = "https://www.codebuddy.ai/v2/chat/completions";
  const body = {
    model: model,
    stream: true,
    messages: [
      { role: "system", content: "You are CodeBuddy Code." },
      { role: "user", content: [{ type: "text", text: "Say hello in 3 words." }] }
    ]
  };

  const convId = crypto.randomUUID();
  const reqId = crypto.randomUUID();
  const msgId = crypto.randomUUID();

  const headers = {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
    "User-Agent": "IDE/2.108.1 CodeBuddy/2.108.1",
    "X-Product": "SaaS",
    "X-IDE-Type": "IDE",
    "X-IDE-Name": "IDE",
    "x-requested-with": "XMLHttpRequest",
    "x-codebuddy-request": "1",
    "X-Conversation-ID": convId,
    "X-Conversation-Request-ID": reqId,
    "X-Conversation-Message-ID": msgId
  };

  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const elapsed = Date.now() - startTime;
    if (!res.ok) {
      const errText = await res.text();
      return { model, status: res.status, ok: false, elapsed, error: errText.slice(0, 300) };
    }

    // Read first few chunks
    const text = await res.text();
    const firstLines = text.slice(0, 300);
    return { model, status: res.status, ok: true, elapsed, responseSample: firstLines };
  } catch (err) {
    return { model, status: 0, ok: false, error: err.message };
  }
}

async function main() {
  const prisma = new PrismaClient();
  const conns = await prisma.providerConnection.findMany({ where: { provider: 'CODEBUDDY' } });
  console.log('Total CodeBuddy connections:', conns.length);
  if (conns.length === 0) {
    console.log('No CodeBuddy connection in database!');
    return;
  }

  const conn = conns[0];
  const token = decryptCredential(conn.accessTokenEnc);
  console.log('Using connection:', conn.name, 'Token prefix:', token.slice(0, 10));
  if (token.includes('.')) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      console.log('JWT Payload:', JSON.stringify(payload, null, 2));
    } catch (e) {
      console.log('JWT decode error:', e.message);
    }
  }

  console.log('\n--- TESTING ALL 15 MODELS ---\n');
  for (const m of modelsToTest) {
    process.stdout.write(`Testing ${m}... `);
    const result = await testModel(token, m);
    if (result.ok) {
      console.log(`✅ OK (${result.elapsed}ms)`);
      console.log(`   Sample: ${result.responseSample.replace(/\n/g, ' ').slice(0, 100)}...`);
    } else {
      console.log(`❌ FAILED HTTP ${result.status} (${result.elapsed}ms)`);
      console.log(`   Error: ${result.error}`);
    }
  }
}

main();
