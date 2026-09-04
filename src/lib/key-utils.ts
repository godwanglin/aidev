import crypto from "crypto";

const PREFIX = process.env.INTERNAL_KEY_PREFIX || "sk-int-";

export function generateApiKey(): { rawKey: string; prefix: string; hashedKey: string } {
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const rawKey = `${PREFIX}${randomBytes}`;
  const prefix = `${PREFIX}${randomBytes.slice(0, 4)}...${randomBytes.slice(-4)}`;
  const hashedKey = hashApiKey(rawKey);
  return { rawKey, prefix, hashedKey };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}
