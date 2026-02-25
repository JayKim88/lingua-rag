import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinguaRAG - 독일어 학습",
  description: "독독독 A1 기반 AI 독일어 학습 튜터",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}