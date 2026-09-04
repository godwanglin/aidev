import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aidev Gateway",
  description: "High-Performance AI Gateway & Proxy Platform",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
