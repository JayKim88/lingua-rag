"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Annotation } from "@/lib/annotations";
import type { VocabEntry } from "@/lib/annotations";

// Inject flash animation for note items (one-time)
if (
  typeof document !== "undefined" &&
  !document.getElementById("note-panel-flash-style")
) {
  const s = document.createElement("style");
  s.id = "note-panel-flash-style";
  s.textContent = `@keyframes notePanelFlash { 0%{background:#dbeafe} 50%{background:#eff6ff} 100%{background:transparent} }`;
  document.head.appendChild(s);
}

type Tab = "memo" | "vocab";

export interface NoteSlideProps {
  open: boolean;
  /** Pre-fill when creating a new note from text selection */
  highlightedText?: string;
  pageNumber: number;
  /** All highlight-type annotations for this PDF */
  notes: Annotation[];
  onSave: (
    note: string,
    highlightedText: string | null,
    pageNumber: number,
  ) => void;
  onUpdate: (noteId: string, text: string) => void;
  onDelete: (noteId: string) => void;
  onClose: () => void;
  /** Clear highlight mode without closing the panel */
  onClearHighlight?: () => void;
  /** Flash a highlighted sentence on the PDF */
  onFlashHighlight?: (text: string, page: number, source?: "vocab") => void;
  /** Text to flash in the panel (from clicking a highlight in PDF) */
  flashText?: string | null;
  /** Monotonic key to re-trigger flash even for the same text */
  flashKey?: number;
  /** When true, always filter by current page (ignore showAll toggle) */
  forcePageFilter?: boolean;
  /** Vocabulary entries for this PDF */
  vocabulary: VocabEntry[];
  onVocabSave: (word: string, meaning: string, pageNumber: number) => void;
  onVocabUpdate: (vocabId: string, word: string, meaning: string) => void;
  onVocabDelete: (vocabId: string) => void;
  /** Language labels for vocab table headers */
  pdfLanguage?: string | null;
  /** Pre-fill word when adding from selection popup */
  initialVocabWord?: string;
  /** Force switch to vocab tab */
  forceVocabTab?: boolean;
  /** Force switch to memo tab */
  forceMemoTab?: boolean;
  /** TTS speak function */
  speak?: (text: string) => void;
}

const LANG_LABELS: Record<string, string> = {
  "de-DE": "독일어",
  "en-US": "영어",
  "ja-JP": "일본어",
  "zh-CN": "중국어",
  "fr-FR": "프랑스어",
  "es-ES": "스페인어",
};

export default function NoteSlidePanel({
  open,
  highlightedText,
  pageNumber,
  notes,
  onSave,
  onUpdate,
  onDelete,
  onClose,
  onClearHighlight,
  onFlashHighlight,
  flashText,
  flashKey,
  forcePageFilter,
  vocabulary,
  onVocabSave,
  onVocabUpdate,
  onVocabDelete,
  pdfLanguage,
  initialVocabWord,
  forceVocabTab,
  forceMemoTab,
  speak,
}: NoteSlideProps) {
  const [tab, setTab] = useState<Tab>("memo");
  const [noteText, setNoteText] = useState("");
  const [memoText, setMemoText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showAll, setShowAll] = useState(() => {
    try {
      return localStorage.getItem("note_panel_show_all") === "true";
    } catch {
      return false;
    }
  });
  const [flashingNoteId, setFlashingNoteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isCreating = !!highlightedText;

  // Vocab state
  const [vocabWord, setVocabWord] = useState("");
  const [vocabMeaning, setVocabMeaning] = useState("");
  const [vocabEditId, setVocabEditId] = useState<string | null>(null);
  const [flashingVocabId, setFlashingVocabId] = useState<string | null>(null);
  const [vocabEditWord, setVocabEditWord] = useState("");
  const [vocabEditMeaning, setVocabEditMeaning] = useState("");
  const [vocabDeleteConfirm, setVocabDeleteConfirm] = useState<string | null>(
    null,
  );
  const [vocabDuplicate, setVocabDuplicate] = useState<VocabEntry | null>(null);
  const vocabWordRef = useRef<HTMLInputElement>(null);

  // Switch to vocab tab when forceVocabTab is set
  useEffect(() => {
    if (forceVocabTab && open) {
      setTab("vocab");
    }
  }, [forceVocabTab, open]);

  // Switch to memo tab when forceMemoTab is set (e.g. clicking a note highlight)
  useEffect(() => {
    if (forceMemoTab && open) {
      setTab("memo");
    }
  }, [forceMemoTab, open]);

  // Pre-fill vocab word from selection popup
  useEffect(() => {
    if (initialVocabWord && open && tab === "vocab") {
      setVocabWord(initialVocabWord);
      setTimeout(() => vocabWordRef.current?.focus(), 200);
    }
  }, [initialVocabWord, open, tab]);

  // Persist showAll toggle
  useEffect(() => {
    try {
      localStorage.setItem("note_panel_show_all", String(showAll));
    } catch {
      /* noop */
    }
  }, [showAll]);

  // Auto-focus textarea when opening in create mode
  useEffect(() => {
    if (open && isCreating) {
      setNoteText("");
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [open, isCreating, highlightedText]);

  // Reset states when panel closes
  useEffect(() => {
    if (!open) {
      setDeleteConfirm(null);
      setEditingId(null);
      setFlashingNoteId(null);
      setVocabEditId(null);
      setVocabDeleteConfirm(null);
    }
  }, [open]);

  // Flash the note matching flashText (only when flashKey changes = PDF highlight clicked)
  useEffect(() => {
    if (!flashText || !open || !flashKey) return;
    const match = notes.find((n) => n.highlighted_text === flashText);
    if (match) {
      setFlashingNoteId(match.id);
      const timer = setTimeout(() => setFlashingNoteId(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [flashKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus edit textarea
  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 50);
  }, [editingId]);

  const handleSaveHighlight = () => {
    if (!highlightedText || !pageNumber) return;
    onSave(noteText.trim(), highlightedText, pageNumber);
    setNoteText("");
  };

  const handleSaveMemo = () => {
    if (!memoText.trim()) return;
    onSave(memoText.trim(), null, pageNumber);
    setMemoText("");
  };

  const handleUpdate = (id: string) => {
    onUpdate(id, editText.trim());
    setEditingId(null);
    setEditText("");
  };

  // Filter notes by current page or show all
  const visibleNotes =
    !forcePageFilter && showAll
      ? notes
      : notes.filter((n) => n.page_num === pageNumber);

  // Group notes by page
  const notesByPage = visibleNotes.reduce<Record<number, Annotation[]>>(
    (acc, n) => {
      (acc[n.page_num] ||= []).push(n);
      return acc;
    },
    {},
  );
  const sortedPages = Object.keys(notesByPage)
    .map(Number)
    .sort((a, b) => a - b);

  const handleNoteClick = useCallback(
    (note: Annotation) => {
      if (note.highlighted_text) {
        onFlashHighlight?.(note.highlighted_text, note.page_num);
      }
    },
    [onFlashHighlight],
  );

  // Vocab helpers
  const handleVocabSave = (force = false) => {
    if (!vocabWord.trim()) return;
    const word = vocabWord.trim();
    if (!force) {
      const existing = vocabulary.find(
        (v) => v.word.toLowerCase() === word.toLowerCase(),
      );
      if (existing) {
        setVocabDuplicate(existing);
        return;
      }
    }
    setVocabDuplicate(null);
    onVocabSave(word, vocabMeaning.trim(), pageNumber);
    setVocabWord("");
    setVocabMeaning("");
    setTimeout(() => vocabWordRef.current?.focus(), 50);
  };

  const handleVocabUpdate = (id: string) => {
    onVocabUpdate(id, vocabEditWord.trim(), vocabEditMeaning.trim());
    setVocabEditId(null);
  };

  const visibleVocab = showAll
    ? vocabulary
    : vocabulary.filter((v) => v.page_num === pageNumber);

  const handleVocabClick = useCallback(
    (entry: VocabEntry) => {
      onFlashHighlight?.(entry.word, entry.page_num, "vocab");
      setFlashingVocabId(entry.id);
      setTimeout(() => setFlashingVocabId(null), 1500);
    },
    [onFlashHighlight],
  );

  const langLabel = pdfLanguage
    ? (LANG_LABELS[pdfLanguage] ?? pdfLanguage.slice(0, 2).toUpperCase())
    : "단어";

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-[380px] max-w-[90vw] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab("memo")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === "memo"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                메모
              </button>
              <button
                onClick={() => setTab("vocab")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === "vocab"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                단어장
              </button>
            </div>
            {tab === "memo" && visibleNotes.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {visibleNotes.length}
              </span>
            )}
            {tab === "vocab" && visibleVocab.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {visibleVocab.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Show all toggle (shared between memo & vocab tabs) */}
            {(tab === "vocab" || tab === "memo") && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  showAll
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
                title={showAll ? "현재 페이지만 보기" : "전체 페이지 보기"}
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
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                {showAll ? "전체" : "이 페이지"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            >
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── MEMO TAB ── */}
          {tab === "memo" && (
            <>
              {/* Memo input (unified) */}
              <div className="p-4 border-b border-gray-100">
                {isCreating && (
                  <div className="mb-3 p-3 bg-yellow-50 border-l-[3px] border-yellow-400 rounded-r-lg">
                    <span className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wider">
                      p.{pageNumber}
                    </span>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 mt-1">
                      &ldquo;{highlightedText}&rdquo;
                    </p>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={isCreating ? noteText : memoText}
                  onChange={(e) =>
                    isCreating
                      ? setNoteText(e.target.value)
                      : setMemoText(e.target.value)
                  }
                  placeholder={
                    isCreating
                      ? "이 문장에 대한 메모를 작성하세요..."
                      : "메모 작성..."
                  }
                  className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      isCreating ? handleSaveHighlight() : handleSaveMemo();
                    }
                  }}
                />
                <div className="flex justify-end gap-2 mt-2">
                  {isCreating && (
                    <button
                      onClick={onClearHighlight}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      취소
                    </button>
                  )}
                  <button
                    onClick={isCreating ? handleSaveHighlight : handleSaveMemo}
                    disabled={isCreating ? !noteText.trim() : !memoText.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    {isCreating ? "저장" : "추가"}{" "}
                    <span className="ml-1 text-blue-300 text-[10px]">
                      &#8984;&#8629;
                    </span>
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {visibleNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <svg
                    className="w-10 h-10 mb-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <p className="text-sm font-medium">노트가 없습니다</p>
                  <p className="text-xs mt-1">
                    텍스트를 드래그해서 &quot;노트&quot; 버튼으로 추가하거나,
                  </p>
                  <p className="text-xs">위 입력란에 메모를 작성하세요</p>
                </div>
              ) : (
                <div className="py-2">
                  {sortedPages.map((page) => (
                    <div key={page}>
                      {showAll && (
                        <div className="px-4 py-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            Page {page}
                          </span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                      )}
                      {notesByPage[page].map((note) => (
                        <div
                          key={note.id}
                          style={
                            flashingNoteId === note.id
                              ? {
                                  animation:
                                    "notePanelFlash 0.5s ease-in-out 3 forwards",
                                }
                              : undefined
                          }
                          className={`group mx-3 mb-2 p-3 rounded-lg border transition-all ${
                            note.highlighted_text ? "cursor-pointer" : ""
                          } ${
                            flashingNoteId === note.id
                              ? "border-blue-400"
                              : "border-gray-100 hover:border-blue-200 hover:bg-blue-50/30"
                          }`}
                          onClick={() => {
                            if (editingId === note.id) return;
                            handleNoteClick(note);
                          }}
                        >
                          {note.highlighted_text && (
                            <p className="text-xs text-blue-600/80 leading-relaxed mb-1.5 line-clamp-2 italic">
                              &ldquo;{note.highlighted_text}&rdquo;
                            </p>
                          )}
                          {editingId === note.id ? (
                            <div onClick={(e) => e.stopPropagation()}>
                              <textarea
                                ref={editRef}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                                rows={3}
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "Enter" &&
                                    (e.metaKey || e.ctrlKey)
                                  ) {
                                    e.preventDefault();
                                    handleUpdate(note.id);
                                  }
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                              <div className="flex justify-end gap-1.5 mt-1.5">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                >
                                  취소
                                </button>
                                <button
                                  onClick={() => handleUpdate(note.id)}
                                  className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-700 leading-relaxed">
                              {note.text || (
                                <span className="text-gray-400 italic">
                                  메모 없음
                                </span>
                              )}
                            </p>
                          )}
                          {editingId !== note.id && (
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-gray-400">
                                {new Date(note.created_at).toLocaleDateString(
                                  "ko-KR",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                {deleteConfirm === note.id ? (
                                  <>
                                    <span className="text-[10px] text-red-500">
                                      삭제?
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(note.id);
                                        setDeleteConfirm(null);
                                      }}
                                      className="text-[10px] text-red-600 font-medium hover:underline"
                                    >
                                      확인
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirm(null);
                                      }}
                                      className="text-[10px] text-gray-400 hover:underline"
                                    >
                                      취소
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(note.id);
                                        setEditText(note.text);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-blue-50 transition-all"
                                      title="수정"
                                    >
                                      <svg
                                        className="w-3 h-3 text-gray-400 hover:text-blue-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirm(note.id);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 transition-all"
                                      title="삭제"
                                    >
                                      <svg
                                        className="w-3 h-3 text-gray-400 hover:text-red-500"
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
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── VOCAB TAB ── */}
          {tab === "vocab" && (
            <>
              {/* Add vocabulary input */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-2">
                <input
                  ref={vocabWordRef}
                  value={vocabWord}
                  onChange={(e) => {
                    setVocabWord(e.target.value);
                    setVocabDuplicate(null);
                  }}
                  placeholder={`${langLabel} 단어 입력...`}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleVocabSave();
                    }
                  }}
                />
                <input
                  value={vocabMeaning}
                  onChange={(e) => setVocabMeaning(e.target.value)}
                  placeholder="뜻 입력..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleVocabSave();
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setVocabWord("");
                      setVocabMeaning("");
                    }}
                    disabled={!vocabWord && !vocabMeaning}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 rounded-md transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleVocabSave()}
                    disabled={!vocabWord.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    저장{" "}
                    <span className="ml-1 text-blue-300 text-[10px]">
                      &#8984;&#8629;
                    </span>
                  </button>
                </div>
                {vocabDuplicate && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                    <svg
                      className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-amber-800">
                        <span className="font-semibold">
                          &quot;{vocabDuplicate.word}&quot;
                        </span>
                        이(가) p.{vocabDuplicate.page_num}에 이미 있습니다.
                      </p>
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={() => handleVocabSave(true)}
                          className="px-2 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
                        >
                          그래도 저장
                        </button>
                        <button
                          onClick={() => {
                            setVocabDuplicate(null);
                            handleVocabClick(vocabDuplicate);
                          }}
                          className="px-2 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                        >
                          기존 단어로 이동
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Vocabulary table */}
              {visibleVocab.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <svg
                    className="w-10 h-10 mb-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                  <p className="text-sm font-medium">단어가 없습니다</p>
                  <p className="text-xs mt-1">
                    PDF에서 텍스트를 드래그하여 &quot;단어장&quot;으로
                    추가하거나,
                  </p>
                  <p className="text-xs">위 입력란에 직접 입력하세요</p>
                </div>
              ) : (
                <div className="mx-3 py-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1.5 px-2 text-gray-500 font-medium">
                          {langLabel}
                        </th>
                        <th className="text-left py-1.5 px-2 text-gray-500 font-medium">
                          뜻
                        </th>
                        {showAll && (
                          <th className="text-right py-1.5 px-2 text-gray-400 font-medium w-10">
                            p.
                          </th>
                        )}
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleVocab.map((entry) => (
                        <tr
                          key={entry.id}
                          className="group border-b border-gray-50 hover:bg-blue-50/30 transition-colors cursor-pointer"
                          style={
                            flashingVocabId === entry.id
                              ? {
                                  animation:
                                    "notePanelFlash 0.5s ease-in-out 3 forwards",
                                }
                              : undefined
                          }
                          onClick={() =>
                            vocabEditId !== entry.id && handleVocabClick(entry)
                          }
                        >
                          {vocabEditId === entry.id ? (
                            <>
                              <td className="py-1.5 px-2">
                                <input
                                  autoFocus
                                  value={vocabEditWord}
                                  onChange={(e) =>
                                    setVocabEditWord(e.target.value)
                                  }
                                  className="w-full px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleVocabUpdate(entry.id);
                                    if (e.key === "Escape")
                                      setVocabEditId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td
                                className="py-1.5 px-2"
                                colSpan={showAll ? 2 : 1}
                              >
                                <input
                                  value={vocabEditMeaning}
                                  onChange={(e) =>
                                    setVocabEditMeaning(e.target.value)
                                  }
                                  className="w-full px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleVocabUpdate(entry.id);
                                    if (e.key === "Escape")
                                      setVocabEditId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td
                                className="py-1.5 px-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={() => handleVocabUpdate(entry.id)}
                                    className="p-0.5 rounded hover:bg-blue-100"
                                    title="저장"
                                  >
                                    <svg
                                      className="w-3 h-3 text-blue-500"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setVocabEditId(null)}
                                    className="p-0.5 rounded hover:bg-gray-100"
                                    title="취소"
                                  >
                                    <svg
                                      className="w-3 h-3 text-gray-400"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-1.5 px-2 text-gray-800 font-medium">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  {entry.word}
                                  {speak && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        speak(entry.word);
                                      }}
                                      className="p-0.5 rounded hover:bg-blue-50 transition-colors shrink-0"
                                      title="발음 듣기"
                                    >
                                      <svg
                                        className="w-3 h-3 text-gray-300 hover:text-blue-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.788v6.424a.5.5 0 00.757.429l4.964-3.212a.5.5 0 000-.858L7.257 8.36a.5.5 0 00-.757.429z"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-gray-600">
                                {entry.meaning || (
                                  <span className="text-gray-300 italic">
                                    -
                                  </span>
                                )}
                              </td>
                              {showAll && (
                                <td className="py-1.5 px-2 text-right text-gray-400 text-[10px]">
                                  {entry.page_num}
                                </td>
                              )}
                              <td
                                className="py-1.5 px-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {vocabDeleteConfirm === entry.id ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          onVocabDelete(entry.id);
                                          setVocabDeleteConfirm(null);
                                        }}
                                        className="p-0.5 rounded hover:bg-red-50"
                                        title="확인"
                                      >
                                        <svg
                                          className="w-3 h-3 text-red-500"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M5 13l4 4L19 7"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() =>
                                          setVocabDeleteConfirm(null)
                                        }
                                        className="p-0.5 rounded hover:bg-gray-100"
                                        title="취소"
                                      >
                                        <svg
                                          className="w-3 h-3 text-gray-400"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M6 18L18 6M6 6l12 12"
                                          />
                                        </svg>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => {
                                          setVocabEditId(entry.id);
                                          setVocabEditWord(entry.word);
                                          setVocabEditMeaning(
                                            entry.meaning ?? "",
                                          );
                                        }}
                                        className="p-0.5 rounded hover:bg-blue-50"
                                        title="수정"
                                      >
                                        <svg
                                          className="w-3 h-3 text-gray-400 hover:text-blue-500"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() =>
                                          setVocabDeleteConfirm(entry.id)
                                        }
                                        className="p-0.5 rounded hover:bg-red-50"
                                        title="삭제"
                                      >
                                        <svg
                                          className="w-3 h-3 text-gray-400 hover:text-red-500"
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
                                    </>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
