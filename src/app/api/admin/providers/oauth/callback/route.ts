import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") || "";
  const state = searchParams.get("state") || "";
  const error = searchParams.get("error") || searchParams.get("error_description") || "";
  const fullUrl = req.url;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OAuth Authorization Status</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      width: 48px;
      height: 48px;
      line-height: 48px;
      border-radius: 50%;
      background: ${error ? "#ef4444" : "#10b981"};
      color: #fff;
      font-size: 24px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 20px;
    }
    p {
      color: #94a3b8;
      font-size: 13.5px;
      line-height: 1.5;
      margin: 0 0 20px;
    }
    .copy-box {
      background: #0f172a;
      border: 1px solid #334155;
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      color: #38bdf8;
      word-break: break-all;
      user-select: all;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${error ? "✕" : "✓"}</div>
    <h2>${error ? "Authorization Failed" : "Authorization Successful!"}</h2>
    <p>
      ${
        error
          ? `Error: ${error}`
          : "Your account has been authorized. Sending credentials to the Aidev Gateway..."
      }
    </p>

    <div style="font-size: 11.5px; color: #64748b; margin-bottom: 8px;">
      If the window does not close automatically, copy the full URL below and paste it into Step 2:
    </div>
    <div class="copy-box">${fullUrl}</div>

    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({
            type: "OAUTH_CALLBACK",
            code: ${JSON.stringify(code)},
            state: ${JSON.stringify(state)},
            error: ${JSON.stringify(error)},
            fullUrl: ${JSON.stringify(fullUrl)}
          }, "*");
          setTimeout(() => {
            window.close();
          }, 1200);
        }
      } catch (e) {
        console.error("Popup communication error:", e);
      }
    </script>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
