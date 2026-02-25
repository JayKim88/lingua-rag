"use client";

import { Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";

interface MessageListProps {
  messages: Message[];
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
            }`}
          >
            {msg.role === "user" ? (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-strong:text-gray-900">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
                {msg.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                )}
                {msg.isTruncated && !msg.isStreaming && (
                  <p className="text-xs text-amber-600 mt-1">⚠ 응답이 잘렸습니다. 더 짧게 질문해 보세요.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}