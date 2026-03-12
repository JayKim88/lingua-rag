import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinguaRAG - AI Language Tutor",
  description: "PDF 기반 AI 언어학습 튜터",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
