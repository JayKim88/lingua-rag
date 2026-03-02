"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import MessageList, { ChatActionsCtx, MARKDOWN_COMPONENTS } from "./MessageList";
import InputBar from "./InputBar";
import { useChat } from "@/hooks/useChat";
import { useTTS } from "@/hooks/useTTS";
import { UNITS, SavedSummary } from "@/lib/types";
import {
  getSummaries,
  saveSummary,
  deleteSummary,
  formatSavedAt,
} from "@/lib/summaries";

interface ChatPanelProps {
  unitId: string;
  level: "A1" | "A2";
  textbookId: string;
  injectText?: { text: string; id: number };
  pageImage?: string | null;
}

export default function ChatPanel({
  unitId,
  level,
  textbookId,
  injectText,
  pageImage,
}: ChatPanelProps) {
  const { messages, isStreaming, isLoadingHistory, queueSize, sendMessage, sendSummary } =
    useChat({ unitId, level, textbookId, pageImage });
  const { speak, volume, setVolume } = useTTS();

  const unitTitle = UNITS.find((u) => u.id === unitId)?.title ?? unitId;

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
  // Summary state
  // ---------------------------------------------------------------------------
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [showSummaries, setShowSummaries] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(null);

  // Load summaries for this unit from Supabase
  const reloadSummaries = useCallback(async () => {
    const data = await getSummaries(unitId);
    setSummaries(data);
  }, [unitId]);

  useEffect(() => {
    reloadSummaries();
  }, [reloadSummaries]);

  const handleSaveSummary = useCallback(
    async (content: string) => {
      try {
        await saveSummary({ unitId, unitTitle, content });
        await reloadSummaries();
      } catch {
        // optimistic UI feedback already shown in SaveSummaryButton
      }
    },
    [unitId, unitTitle, reloadSummaries]
  );

  const handleDeleteSummary = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteSummary(id);
      if (selectedSummary?.id === id) setSelectedSummary(null);
      await reloadSummaries();
    },
    [selectedSummary?.id, reloadSummaries]
  );

  // Close summaries overlay when user sends a new message
  const handleSend = useCallback(
    (content: string) => {
      setShowSummaries(false);
      sendMessage(content);
    },
    [sendMessage]
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSummaries) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showSummaries]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Summary toolbar — visible when there are messages */}
      {!isLoadingHistory && messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={() => {
              setShowSummaries(true);
              setSelectedSummary(null);
            }}
            title="저장된 요약 보기"
            className={`ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
              summaries.length > 0
                ? "text-blue-600 hover:bg-blue-50"
                : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            }`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            저장된 요약
            {summaries.length > 0 && (
              <span className="ml-0.5 bg-blue-100 text-blue-600 text-[10px] font-semibold px-1 rounded-full">
                {summaries.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Messages area — relative container for the summaries overlay */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full gap-2 text-gray-400 text-sm">
              <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              이전 대화 불러오는 중...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              이 단원에 대해 무엇이든 질문해보세요.
            </div>
          ) : (
            <MessageList
              messages={messages}
              speak={speak}
              onInject={(text) => setLocalInject({ text, id: Date.now() })}
              onSaveSummary={handleSaveSummary}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Summaries overlay — slides over the messages area */}
        {showSummaries && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col">
            {/* Overlay header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 shrink-0">
              <button
                onClick={() => {
                  if (selectedSummary) {
                    setSelectedSummary(null);
                  } else {
                    setShowSummaries(false);
                  }
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title={selectedSummary ? "목록으로" : "채팅으로"}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {selectedSummary ? selectedSummary.unitTitle : "저장된 요약"}
              </span>
              {selectedSummary && (
                <span className="text-xs text-gray-400 ml-1">
                  {formatSavedAt(selectedSummary.savedAt)}
                </span>
              )}
            </div>

            {/* Overlay body */}
            {selectedSummary ? (
              /* Summary detail */
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ChatActionsCtx.Provider
                  value={{
                    speak,
                    onInject: (text) => setLocalInject({ text, id: Date.now() }),
                  }}
                >
                  <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-strong:text-gray-900 text-gray-800">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={MARKDOWN_COMPONENTS}
                    >
                      {selectedSummary.content}
                    </ReactMarkdown>
                  </div>
                </ChatActionsCtx.Provider>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={(e) => {
                      handleDeleteSummary(selectedSummary.id, e);
                      setShowSummaries(summaries.length > 1);
                    }}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              /* Summary list */
              <div className="flex-1 overflow-y-auto">
                {summaries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                    <svg
                      className="w-8 h-8 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                      />
                    </svg>
                    <p className="text-sm">저장된 요약이 없습니다</p>
                    <p className="text-xs text-gray-300">
                      요약하기 버튼으로 대화를 요약할 수 있습니다
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {summaries.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSummary(s)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer group transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-700 truncate">
                              {s.unitTitle}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatSavedAt(s.savedAt)}
                            </p>
                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
                              {s.content
                                .replace(/#{1,3}\s*/g, "")
                                .replace(/[📚🔤📖💡]\s*/g, "")
                                .trim()
                                .slice(0, 120)}
                              …
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSummary(s.id, e)}
                            title="삭제"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 mt-0.5"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <InputBar
        onSend={handleSend}
        isStreaming={isStreaming || isLoadingHistory}
        queueSize={queueSize}
        volume={volume}
        onVolumeChange={setVolume}
        injectText={mergedInjectText}
        hasPageContext={!!pageImage}
        onSummary={sendSummary}
        showSummary={showSummaries}
      />
    </div>
  );
}
