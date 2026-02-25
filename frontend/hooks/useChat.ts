"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Message } from "@/lib/types";

interface UseChatOptions {
  unitId: string;
  level: "A1" | "A2";
  textbookId: string;
}

export function useChat({ unitId, level, textbookId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  const queue = useRef<string[]>([]);
  const streamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state and abort any in-flight fetch when the unit changes
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setQueueSize(0);
    queue.current = [];
    streamingRef.current = false;
    setIsStreaming(false);
  }, [unitId]);

  const processMessage = useCallback(
    async (content: string) => {
      streamingRef.current = true;
      setIsStreaming(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
      };
      const assistantMsgId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            unit_id: unitId,
            level,
            textbook_id: textbookId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");

        let buffer = "";
        let done = false;

        while (!done) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            // Guard [DONE] before JSON.parse — breaks both loops via flag
            if (data === "[DONE]") {
              done = true;
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "token") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + parsed.content }
                      : m
                  )
                );
              } else if (parsed.type === "truncated") {
                // Beta's truncation detection: Claude hit max_tokens mid-response
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, isTruncated: true }
                      : m
                  )
                );
              } else if (parsed.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: parsed.message ?? parsed.content, isStreaming: false }
                      : m
                  )
                );
              }
            } catch {
              // Ignore parse errors for individual chunks
            }
          }
        }
      } catch (err) {
        // Swallow abort errors — these are intentional (unit change)
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const errorMsg = err instanceof Error ? err.message : "알 수 없는 오류";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `오류가 발생했습니다: ${errorMsg}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        abortControllerRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          )
        );
        streamingRef.current = false;
        setIsStreaming(false);

        // Process next queued message
        if (queue.current.length > 0) {
          const next = queue.current.shift()!;
          setQueueSize(queue.current.length);
          await processMessage(next);
        }
      }
    },
    [unitId, level, textbookId]
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (streamingRef.current) {
        queue.current.push(content);
        setQueueSize(queue.current.length);
      } else {
        processMessage(content);
      }
    },
    [processMessage]
  );

  return { messages, isStreaming, queueSize, sendMessage };
}