"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import MessageList, { ChatActionsCtx, MARKDOWN_COMPONENTS } from "./MessageList";
import PronunciationModal from "./PronunciationModal";
import InputBar from "./InputBar";
import { useChat } from "@/hooks/useChat";
import { UNITS, SavedSummary, SavedNote } from "@/lib/types";
import {
  getSummaries,
  saveSummary,
  deleteSummary,
  formatSavedAt,
} from "@/lib/summaries";
import { getNotes, saveNote, deleteNote } from "@/lib/notes";
import { patchFeedback } from "@/lib/feedback";

interface ChatPanelProps {
  unitId: string;
  level: "A1" | "A2";
  textbookId: string;
  injectText?: { text: string; id: number };
  pageImage?: string | null;
  speak: (text: string) => void;
}

export default function ChatPanel({
  unitId,
  level,
  textbookId,
  injectText,
  pageImage,
  speak,
}: ChatPanelProps) {
  const { messages, isStreaming, isLoadingHistory, queueSize, sendMessage, sendSummary, cancelMessage, updateFeedback } =
    useChat({ unitId, level, textbookId, pageImage });

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
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(null);

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

  // ---------------------------------------------------------------------------
  // Notes (memos) state
  // ---------------------------------------------------------------------------
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<SavedNote | null>(null);

  const reloadNotes = useCallback(async () => {
    const data = await getNotes(unitId);
    setNotes(data);
  }, [unitId]);

  useEffect(() => {
    reloadNotes();
  }, [reloadNotes]);

  const handleDeleteNote = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteNote(id);
      if (selectedNote?.id === id) setSelectedNote(null);
      await reloadNotes();
    },
    [selectedNote?.id, reloadNotes]
  );

  // ---------------------------------------------------------------------------
  // Notes overlay + tab state
  // ---------------------------------------------------------------------------
  const [showNotes, setShowNotes] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "memo">("summary");

  // ---------------------------------------------------------------------------
  // Pronunciation practice modal
  // ---------------------------------------------------------------------------
  const [practiceText, setPracticeText] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Memo creation modal
  // ---------------------------------------------------------------------------
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoContent, setMemoContent] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);

  const handleOpenMemo = useCallback(() => {
    setMemoContent("");
    setShowMemoModal(true);
  }, []);

  const handleSaveMemo = useCallback(async () => {
    const trimmed = memoContent.trim();
    if (!trimmed) return;
    setIsSavingMemo(true);
    try {
      await saveNote({ unitId, unitTitle, content: trimmed });
      await reloadNotes();
      setShowMemoModal(false);
    } finally {
      setIsSavingMemo(false);
    }
  }, [memoContent, unitId, unitTitle, reloadNotes]);

  // ---------------------------------------------------------------------------
  // Close overlay / send
  // ---------------------------------------------------------------------------
  const handleSend = useCallback(
    (content: string) => {
      setShowNotes(false);
      sendMessage(content);
    },
    [sendMessage]
  );

  // ---------------------------------------------------------------------------
  // Auto-scroll
  // ---------------------------------------------------------------------------
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLoadingRef = useRef(true);

  useEffect(() => {
    if (showNotes || isLoadingHistory) return;

    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = false;

    bottomRef.current?.scrollIntoView({ behavior: wasLoading ? "instant" : "smooth" });
  }, [messages, isLoadingHistory, showNotes]);

  const totalNoteCount = summaries.length + notes.length;

  // ---------------------------------------------------------------------------
  // Shared delete icon
  // ---------------------------------------------------------------------------
  const DeleteIcon = () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar — visible when there are messages */}
      {!isLoadingHistory && messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={() => {
              setShowNotes(true);
              setSelectedSummary(null);
              setSelectedNote(null);
            }}
            title="노트 보기"
            className={`ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
              totalNoteCount > 0
                ? "text-blue-600 hover:bg-blue-50"
                : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            노트보기
            {totalNoteCount > 0 && (
              <span className="ml-0.5 bg-blue-100 text-blue-600 text-[10px] font-semibold px-1 rounded-full">
                {totalNoteCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Messages area */}
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
              onPractice={(text) => setPracticeText(text)}
              onSaveSummary={handleSaveSummary}
              onFeedback={async (messageId, feedback) => {
                updateFeedback(messageId, feedback);
                await patchFeedback(messageId, feedback);
              }}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Notes overlay */}
        {showNotes && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col">
            {/* Overlay header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 shrink-0">
              <button
                onClick={() => {
                  if (selectedSummary || selectedNote) {
                    setSelectedSummary(null);
                    setSelectedNote(null);
                  } else {
                    setShowNotes(false);
                  }
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title={selectedSummary || selectedNote ? "목록으로" : "채팅으로"}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {selectedSummary || selectedNote ? (
                <>
                  <span className="text-sm font-semibold text-gray-800">
                    {selectedSummary?.unitTitle ?? selectedNote?.unitTitle}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    {formatSavedAt(selectedSummary?.savedAt ?? selectedNote?.savedAt ?? "")}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-gray-800">노트보기</span>
              )}
            </div>

            {/* Tab bar — only when in list view */}
            {!selectedSummary && !selectedNote && (
              <div className="flex border-b border-gray-100 shrink-0">
                <button
                  onClick={() => setActiveTab("summary")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === "summary"
                      ? "text-blue-600 border-b-2 border-blue-500"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  요약
                  {summaries.length > 0 && (
                    <span className={`ml-1 text-[10px] px-1 rounded-full ${
                      activeTab === "summary" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {summaries.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("memo")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === "memo"
                      ? "text-blue-600 border-b-2 border-blue-500"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  메모
                  {notes.length > 0 && (
                    <span className={`ml-1 text-[10px] px-1 rounded-full ${
                      activeTab === "memo" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {notes.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Overlay body */}
            {selectedSummary ? (
              /* Summary detail */
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ChatActionsCtx.Provider
                  value={{
                    speak,
                    onInject: (text) => setLocalInject({ text, id: Date.now() }),
                    onPractice: (text) => setPracticeText(text),
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
                      if (summaries.length <= 1) setShowNotes(false);
                    }}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <DeleteIcon />
                    삭제
                  </button>
                </div>
              </div>
            ) : selectedNote ? (
              /* Note detail */
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {selectedNote.content}
                </p>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={(e) => {
                      handleDeleteNote(selectedNote.id, e);
                      if (notes.length <= 1) setShowNotes(false);
                    }}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <DeleteIcon />
                    삭제
                  </button>
                </div>
              </div>
            ) : activeTab === "summary" ? (
              /* Summary list */
              <div className="flex-1 overflow-y-auto">
                {summaries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <p className="text-sm">저장된 요약이 없습니다</p>
                    <p className="text-xs text-gray-300">요약하기 버튼으로 대화를 요약할 수 있습니다</p>
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
                            <p className="text-xs font-semibold text-blue-700 truncate">{s.unitTitle}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatSavedAt(s.savedAt)}</p>
                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
                              {s.content.replace(/#{1,3}\s*/g, "").replace(/[📚🔤📖💡]\s*/g, "").trim().slice(0, 120)}…
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSummary(s.id, e)}
                            title="삭제"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 mt-0.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Memo list */
              <div className="flex-1 overflow-y-auto">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                    </svg>
                    <p className="text-sm">작성된 메모가 없습니다</p>
                    <p className="text-xs text-gray-300">메모하기 버튼으로 메모를 추가할 수 있습니다</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => setSelectedNote(n)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer group transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-700 truncate">{n.unitTitle}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatSavedAt(n.savedAt)}</p>
                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
                              {n.content.trim().slice(0, 120)}…
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteNote(n.id, e)}
                            title="삭제"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 mt-0.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      {/* Memo creation modal */}
      {showMemoModal && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMemoModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">메모 작성</h3>
              <button
                onClick={() => setShowMemoModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              autoFocus
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              placeholder="이 단원에 대한 메모를 작성하세요..."
              rows={5}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-gray-800 placeholder-gray-300"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowMemoModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveMemo}
                disabled={!memoContent.trim() || isSavingMemo}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSavingMemo ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <InputBar
        onSend={handleSend}
        onCancel={cancelMessage}
        isStreaming={isStreaming || isLoadingHistory}
        queueSize={queueSize}
        injectText={mergedInjectText}
        hasPageContext={!!pageImage}
        onSummary={sendSummary}
        onMemo={handleOpenMemo}
        showSummary={showNotes}
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
