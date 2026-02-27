import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PixelGuard — AI Privacy Shield",
  description:
    "AI-powered privacy detection, flagging & redaction system. Scan images, documents, and audio for sensitive information before sharing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
