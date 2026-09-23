import { NextResponse } from "next/server";
import crypto from "crypto";

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || "gateway_captcha_super_secret_key_8921";

// Simple noise & distorted characters SVG generator (No plaintext in network payload!)
function generateCaptchaSvg(code: string): string {
  const chars = code.split("");
  const colors = ["#1e40af", "#047857", "#b45309", "#4338ca", "#0f766e"];
  
  let charElements = "";
  chars.forEach((char, i) => {
    const x = 20 + i * 22;
    const y = 25 + (Math.random() * 8 - 4);
    const rot = Math.random() * 26 - 13;
    const col = colors[i % colors.length];
    charElements += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-weight="bold" font-size="22" fill="${col}" transform="rotate(${rot} ${x} ${y})">${char}</text>`;
  });

  // Add random noise lines to confuse simple OCR
  let noiseLines = "";
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * 120;
    const y1 = Math.random() * 36;
    const x2 = Math.random() * 120;
    const y2 = Math.random() * 36;
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.5" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="36" viewBox="0 0 130 36" style="background:#f1f5f9; border-radius:4px; border:1px solid #cbd5e1;">${noiseLines}${charElements}</svg>`;
}

export async function GET() {
  // Generate random 5-character alphanumeric (excluding confusing chars like 0, O, 1, I)
  const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  const svg = generateCaptchaSvg(code);
  const svgBase64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  // Encrypted token only containing salted SHA-256 hash of the solution
  const salt = crypto.randomBytes(8).toString("hex");
  const hashedSolution = crypto
    .createHash("sha256")
    .update(`${code.toUpperCase()}:${salt}:${CAPTCHA_SECRET}`)
    .digest("hex");

  const tokenData = `${salt}:${Date.now()}:${hashedSolution}`;
  const sig = crypto.createHmac("sha256", CAPTCHA_SECRET).update(tokenData).digest("hex");
  const captchaToken = Buffer.from(`${tokenData}:${sig}`).toString("base64");

  return NextResponse.json({
    captchaImage: svgBase64, // Visual Image only
    captchaToken,
  });
}
