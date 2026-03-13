"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import MessageList from "./MessageList";
import PronunciationModal from "./PronunciationModal";
import InputBar from "./InputBar";
import { useChat } from "@/hooks/useChat";
import { saveSummary } from "@/lib/summaries";
import { patchFeedback } from "@/lib/feedback";
import SubscriptionModal from "./SubscriptionModal";
import LoginModal from "./LoginModal";

interface ChatPanelProps {
  pdfId: string;
  pdfName: string;
  /** Server-side PDF ID for RAG (guests: set after upload completes). */
  serverPdfId?: string | null;
  injectText?: { text: string; id: number };
  getPageText?: () => Promise<string | null>;
  getPageNumber?: () => number | null;
  hasPdfContext?: boolean;
  speak: (text: string) => void;
  /** Called after summary is saved — parent shows the save destination modal */
  onSummarySaved?: (content: string) => void;
  /** When true, uses guest chat endpoint (no auth required). */
  isGuest?: boolean;
}

export default function ChatPanel({
  pdfId,
  pdfName,
  serverPdfId,
  injectText,
  getPageText,
  getPageNumber,
  hasPdfContext,
  speak,
  onSummarySaved,
  isGuest,
}: ChatPanelProps) {
  const { messages, isStreaming, isLoadingHistory, queueSize, guestLimitReached, sendMessage, sendSummary, cancelMessage, updateFeedback, retryFromMessage } =
    useChat({ pdfId, serverPdfId, getPageText, getPageNumber, isGuest });

  // Paywall modal state
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Auto-show paywall when guest limit is reached
  useEffect(() => {
    if (guestLimitReached) setShowPaywall(true);
  }, [guestLimitReached]);

  // Local inject triggered by "use in input" action button on a message
  const [localInject, setLocalInject] = useState<
    { text: string; id: number } | undefined
  >();

  // Merge PDF inject (injectText prop) and message-level inject (localInject).
  const mergedInjectText = (() => {
    if (!injectText && !localInject) return undefined;
    if (!injectText) return localInject;
    if (!localInject) return injectText;
    return injectText.id >= localInject.id ? injectText : localInject;
  })();

  // ---------------------------------------------------------------------------
  // Summary save
  // ---------------------------------------------------------------------------
  const handleSaveSummary = useCallback(
    async (content: string) => {
      try {
        await saveSummary({ pdfId, pdfName, content });
        onSummarySaved?.(content);
      } catch {
        /* noop */
      }
    },
    [pdfId, pdfName, onSummarySaved]
  );

  // ---------------------------------------------------------------------------
  // Pronunciation practice modal
  // ---------------------------------------------------------------------------
  const [practiceText, setPracticeText] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Auto-scroll
  // ---------------------------------------------------------------------------
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLoadingRef = useRef(true);

  useEffect(() => {
    if (isLoadingHistory) return;

    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = false;

    bottomRef.current?.scrollIntoView({ behavior: wasLoading ? "instant" : "smooth" });
  }, [messages, isLoadingHistory]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full gap-2 text-gray-400 text-sm">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            이전 대화 불러오는 중...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            이 PDF에 대해 무엇이든 질문해보세요.
          </div>
        ) : (
          <MessageList
            messages={messages}
            speak={speak}
            onInject={(text) => setLocalInject({ text, id: Date.now() })}
            onPractice={(text) => setPracticeText(text)}
            onSaveSummary={handleSaveSummary}
            onSaveResponse={(content) => onSummarySaved?.(content)}
            onFeedback={async (messageId, feedback) => {
              updateFeedback(messageId, feedback);
              await patchFeedback(messageId, feedback);
            }}
            onRetry={(messageId) => {
              const content = retryFromMessage(messageId);
              if (content) sendMessage(content);
            }}
            onEdit={(messageId, newContent) => {
              retryFromMessage(messageId);
              sendMessage(newContent);
            }}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {showPaywall && (
        <SubscriptionModal
          onClose={() => setShowPaywall(false)}
          message="무료 체험 메시지를 모두 사용했습니다. Plus로 업그레이드하면 무제한으로 대화할 수 있어요!"
          onLogin={() => {
            setShowPaywall(false);
            setShowLoginModal(true);
          }}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          message="로그인하면 무제한 채팅과 더 많은 기능을 이용할 수 있어요"
        />
      )}

      <InputBar
        onSend={sendMessage}
        onCancel={cancelMessage}
        isStreaming={isStreaming || isLoadingHistory}
        queueSize={queueSize}
        injectText={mergedInjectText}
        hasPageContext={!!hasPdfContext}
        onSummary={sendSummary}
        disabled={guestLimitReached}
        onDisabledClick={() => setShowPaywall(true)}
      />

      {/* Pronunciation practice modal */}
      {practiceText && (
        <PronunciationModal
          key={practiceText}
          text={practiceText}
          speak={speak}
          onClose={() => setPracticeText(null)}
        />
      )}
    </div>
  );
}
