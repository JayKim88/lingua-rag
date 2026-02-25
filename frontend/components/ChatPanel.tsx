"use client";

import { useRef, useEffect } from "react";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import { useChat } from "@/hooks/useChat";

interface ChatPanelProps {
  unitId: string;
  level: "A1" | "A2";
  textbookId: string;
}

export default function ChatPanel({ unitId, level, textbookId }: ChatPanelProps) {
  const { messages, isStreaming, queueSize, sendMessage } = useChat({
    unitId,
    level,
    textbookId,
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            이 단원에 대해 무엇이든 질문해보세요.
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={bottomRef} />
      </div>
      <InputBar
        onSend={sendMessage}
        isStreaming={isStreaming}
        queueSize={queueSize}
      />
    </div>
  );
}