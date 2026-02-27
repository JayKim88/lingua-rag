"use client";

import { useState } from "react";
import { Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface MessageListProps {
  messages: Message[];
  speak: (text: string) => void;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10); // "2026-02-27T10:30:00" → "2026-02-27"
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "오늘";
  if (sameDay(date, yesterday)) return "어제";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1 rounded"
      title="복사"
    >
      {copied ? (
        <span className="text-[10px] font-medium text-green-600">복사됨</span>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function MessageList({ messages, speak }: MessageListProps) {
  let lastDateKey = "";

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        let separator: React.ReactNode = null;
        if (msg.createdAt) {
          const dateKey = toDateKey(msg.createdAt);
          if (dateKey !== lastDateKey) {
            separator = (
              <DateSeparator
                key={`sep-${dateKey}`}
                label={formatDateLabel(msg.createdAt)}
              />
            );
            lastDateKey = dateKey;
          }
        }

        return (
          <div key={msg.id}>
            {separator}
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`relative group max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-strong:text-gray-900">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        strong: ({ children }) => {
                          const text = String(children);
                          // Only enable TTS for German text (no Korean characters)
                          const isGerman = !/[\uAC00-\uD7A3\u3130-\u318F\u1100-\u11FF]/.test(text);
                          if (!isGerman) return <strong>{children}</strong>;
                          return (
                            <button
                              onClick={() => speak(text)}
                              className="font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5 cursor-pointer hover:underline group"
                              title={`"${text}" 발음 듣기`}
                            >
                              {children}
                              <span className="text-[10px] opacity-0 group-hover:opacity-50 ml-0.5">🔊</span>
                            </button>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                    )}
                    {msg.isTruncated && !msg.isStreaming && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠ 응답이 길어져 일부 잘렸습니다. 더 구체적으로 나눠서 질문해 보세요.
                      </p>
                    )}
                  </div>
                )}
                {!msg.isStreaming && msg.content && (
                  <CopyButton text={msg.content} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
