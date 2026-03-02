"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Message } from "@/lib/types";

interface UseChatOptions {
  unitId: string;
  level: "A1" | "A2";
  textbookId: string;
  pageImage?: string | null;
}

export function useChat({ unitId, level, textbookId, pageImage }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [queueSize, setQueueSize] = useState(0);

  const queue = useRef<string[]>([]);
  const streamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // When true, the NEXT processMessage call marks the assistant response as isSummary
  const summaryRequestRef = useRef(false);
  // Incremented on unit switch to orphan background streams.
  // An orphaned processMessage drains the stream so the backend can persist
  // the assistant message, but stops updating the UI.
  const generationRef = useRef(0);

  // On unit change: orphan any running stream (do NOT abort — let it drain so
  // the backend can persist the assistant message), clear UI, load DB history.
  useEffect(() => {
    generationRef.current += 1;
    // Clear the ref without aborting; the in-flight fetch continues draining.
    abortControllerRef.current = null;

    setMessages([]);
    setQueueSize(0);
    queue.current = [];
    streamingRef.current = false;
    setIsStreaming(false);
    setIsLoadingHistory(true);

    let cancelled = false;

    (async () => {
      try {
        const convsRes = await fetch("/api/conversations");
        if (!convsRes.ok || cancelled) return;

        const { conversations } = await convsRes.json();
        // list_by_session returns newest-first; find the latest for this unit
        const conv = (conversations ?? []).find(
          (c: { unit_id: string }) => c.unit_id === unitId
        );
        if (!conv || cancelled) return;

        const msgsRes = await fetch(`/api/conversations/${conv.id}/messages`);
        if (!msgsRes.ok || cancelled) return;

        const { messages: dbMessages } = await msgsRes.json();
        if (!cancelled && dbMessages?.length) {
          setMessages(
            dbMessages.map(
              (m: { id: string; role: "user" | "assistant"; content: string; created_at?: string }) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                isStreaming: false,
                createdAt: m.created_at,
              })
            )
          );
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unitId]);

  const processMessage = useCallback(
    async (content: string) => {
      // Capture generation at call time. If the unit switches mid-stream,
      // generationRef.current will differ from myGeneration and we drain
      // without updating UI.
      const myGeneration = generationRef.current;
      // Consume the summary flag synchronously at call time
      const isSummary = summaryRequestRef.current;
      summaryRequestRef.current = false;

      streamingRef.current = true;
      setIsStreaming(true);

      const now = new Date().toISOString();
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
        isSummaryRequest: isSummary || undefined,
        createdAt: now,
      };
      const assistantMsgId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: now,
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
            ...(pageImage ? { page_image: pageImage } : {}),
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

          // Unit switched: drain the stream so the backend finishes and
          // persists the assistant message, but skip all UI updates.
          if (generationRef.current !== myGeneration) continue;

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, isTruncated: true } : m
                  )
                );
              } else if (parsed.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: parsed.message ?? parsed.content,
                          isStreaming: false,
                        }
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
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (generationRef.current === myGeneration) {
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
        }
      } finally {
        // Only update shared UI state if this is still the active unit.
        // Orphaned streams must not clear abortControllerRef (it may already
        // point to the new unit's controller) or touch isStreaming.
        if (generationRef.current === myGeneration) {
          abortControllerRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, isStreaming: false, ...(isSummary ? { isSummary: true } : {}) }
                : m
            )
          );
          streamingRef.current = false;
          setIsStreaming(false);

          if (queue.current.length > 0) {
            const next = queue.current.shift()!;
            setQueueSize(queue.current.length);
            await processMessage(next);
          }
        }
      }
    },
    [unitId, level, textbookId, pageImage]
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

  const SUMMARY_PROMPT = `지금까지 나눈 대화를 학습 요약해주세요. 아래 형식을 그대로 사용해주세요:

## 📚 오늘 배운 내용
이번 세션의 주요 학습 내용을 설명해주세요.

## 🔤 주요 어휘
대화에서 등장한 독일어 단어와 표현을 정리해주세요.

## 📖 문법 포인트
다룬 문법 사항을 간략히 정리해주세요.

## 💡 핵심 문장
기억할 만한 예문을 1~3개 제시해주세요.`;

  const sendSummary = useCallback(() => {
    summaryRequestRef.current = true;
    sendMessage(SUMMARY_PROMPT);
  }, [sendMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, isStreaming, isLoadingHistory, queueSize, sendMessage, sendSummary };
}
