"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useTTS } from "@/hooks/useTTS";
import ChatPanel from "@/components/ChatPanel";
import {
  savePdfToLibrary,
  loadPdfFromLibrary,
  migratePdfKey,
  upsertLibraryMeta,
  upsertSessionMeta,
  findMetaByChatId,
  findSessionMetaByChatId,
  setSessionMetaPdfServerId,
  generateChatId,
  LIBRARY_CURRENT_KEY,
} from "@/lib/pdfLibrary";
import LoginModal from "@/components/LoginModal";
import SubscriptionModal from "@/components/SubscriptionModal";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
});

/* ── Constants ────────────────────────────────────────────────────────── */

const CHAT_MIN = 280;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 500;

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 280;

type ViewMode = "both" | "pdf" | "chat";

/* ── Component ────────────────────────────────────────────────────────── */

export default function ChatIdPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // PDF state
  const [openFile, setOpenFile] = useState<File | null>(null);
  const [activePdfName, setActivePdfName] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [hasPdfContext, setHasPdfContext] = useState(false);
  const [loading, setLoading] = useState(true);
  // Server-side PDF ID for guest RAG (null = not yet uploaded)
  const [pdfServerId, setPdfServerId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfViewerRef = useRef<any>(null);

  // Layout state
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [showSidebar, setShowSidebar] = useState(true);

  // Chat state
  const [injectText, setInjectText] = useState<
    { text: string; id: number } | undefined
  >();

  // Chat panel resize state
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT);
  const [isChatResizing, setIsChatResizing] = useState(false);
  const isChatResizingRef = useRef(false);
  const chatDragStartX = useRef(0);
  const chatDragStartWidth = useRef(0);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const isSidebarResizingRef = useRef(false);
  const sidebarDragStartX = useRef(0);
  const sidebarDragStartWidth = useRef(0);

  // Drag-drop state
  const [isDragging, setIsDragging] = useState(false);

  // Context menu state
  const [showCtxMenu, setShowCtxMenu] = useState(false);
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>();
  const [showSubModal, setShowSubModal] = useState(false);
  const [subMessage, setSubMessage] = useState<string | undefined>();

  // TTS
  const { speak, language, setLanguage } = useTTS();

  // Load PDF from IndexedDB by chatId; guest: upload to server for RAG
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const loggedIn = !!data.user;

      // Logged-in users use the full /chat page; redirect there
      if (loggedIn) {
        const meta = findMetaByChatId(id);
        if (meta?.chatId)
          localStorage.setItem(LIBRARY_CURRENT_KEY, meta.chatId);
        router.replace("/chat");
        return;
      }

      // Guest: use sessionStorage (per-tab)
      const meta = findSessionMetaByChatId(id) ?? findMetaByChatId(id);

      if (meta) {
        // Restore server PDF ID if already uploaded
        if (meta.pdfServerId) {
          setPdfServerId(meta.pdfServerId);
        }

        const chatId = meta.chatId ?? id;
        let file = await loadPdfFromLibrary(chatId);
        // Migration: try old name-based key
        if (!file) file = await migratePdfKey(meta.name, chatId);
        if (file) {
          setOpenFile(file);
          setActivePdfName(meta.name);
          localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);

          // Guest: upload to server in background for RAG indexing
          if (!loggedIn && !meta.pdfServerId) {
            uploadToServer(file, id);
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upload guest PDF to server and poll until indexed
  const uploadToServer = useCallback(async (file: File, chatId: string) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/guest/pdfs/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        console.warn("Guest upload failed:", await res.text().catch(() => ""));
        return;
      }
      const { id: newPdfServerId } = await res.json();
      setPdfServerId(newPdfServerId);
      setSessionMetaPdfServerId(chatId, newPdfServerId);

      // Poll index status silently
      pollIndexStatus(newPdfServerId);
    } catch (err) {
      console.warn("Guest upload error:", err);
    }
  }, []);

  // Silently poll until indexing completes (no UI indicator — RAG just improves over time)
  const pollIndexStatus = useCallback(async (targetPdfServerId: string) => {
    const maxAttempts = 60; // ~2 minutes
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/guest/pdfs/${targetPdfServerId}/status`);
        if (!res.ok) break;
        const data = await res.json();
        if (data.index_status === "ready" || data.index_status === "failed")
          break;
      } catch {
        break;
      }
    }
  }, []);

  /* ── Resize handlers ── */

  const onSidebarDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isSidebarResizingRef.current = true;
      setIsSidebarResizing(true);
      sidebarDragStartX.current = e.clientX;
      sidebarDragStartWidth.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  const onChatDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isChatResizingRef.current = true;
      setIsChatResizing(true);
      chatDragStartX.current = e.clientX;
      chatDragStartWidth.current = chatWidth;
    },
    [chatWidth],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isChatResizingRef.current) {
        const delta = chatDragStartX.current - e.clientX;
        const next = Math.max(
          CHAT_MIN,
          Math.min(CHAT_MAX, chatDragStartWidth.current + delta),
        );
        setChatWidth(next);
      }
      if (isSidebarResizingRef.current) {
        const delta = e.clientX - sidebarDragStartX.current;
        const next = Math.max(
          SIDEBAR_MIN,
          Math.min(SIDEBAR_MAX, sidebarDragStartWidth.current + delta),
        );
        setSidebarWidth(next);
      }
    };
    const onMouseUp = () => {
      if (isChatResizingRef.current) {
        isChatResizingRef.current = false;
        setIsChatResizing(false);
      }
      if (isSidebarResizingRef.current) {
        isSidebarResizingRef.current = false;
        setIsSidebarResizing(false);
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!showCtxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setShowCtxMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCtxMenu]);

  const handleRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === activePdfName) {
      setIsRenaming(false);
      return;
    }
    // Update sessionStorage meta
    const raw = JSON.parse(sessionStorage.getItem("guest-tab-pdfs") ?? "[]");
    const updated = raw.map((m: { chatId?: string; name: string }) =>
      m.chatId === id ? { ...m, name: trimmed } : m,
    );
    sessionStorage.setItem("guest-tab-pdfs", JSON.stringify(updated));
    // Update localStorage meta
    const libRaw = JSON.parse(localStorage.getItem("lingua_pdf_library") ?? "[]");
    const libUpdated = libRaw.map((m: { chatId?: string; name: string }) =>
      m.chatId === id ? { ...m, name: trimmed } : m,
    );
    localStorage.setItem("lingua_pdf_library", JSON.stringify(libUpdated));
    setActivePdfName(trimmed);
    setIsRenaming(false);
  }, [renameValue, activePdfName, id]);

  const handleDelete = useCallback(async () => {
    if (pdfServerId) {
      fetch(`/api/guest/pdfs/${pdfServerId}`, { method: "DELETE" }).catch(() => {});
    }
    // Remove from sessionStorage
    const raw = JSON.parse(sessionStorage.getItem("guest-tab-pdfs") ?? "[]");
    sessionStorage.setItem(
      "guest-tab-pdfs",
      JSON.stringify(raw.filter((m: { chatId?: string }) => m.chatId !== id)),
    );
    // Remove from localStorage
    const libRaw = JSON.parse(localStorage.getItem("lingua_pdf_library") ?? "[]");
    localStorage.setItem(
      "lingua_pdf_library",
      JSON.stringify(libRaw.filter((m: { chatId?: string }) => m.chatId !== id)),
    );
    localStorage.removeItem(LIBRARY_CURRENT_KEY);
    router.push("/");
  }, [id, pdfServerId, router]);

  /* ── Helpers ── */

  const requireLogin = useCallback((message?: string) => {
    setLoginMessage(message);
    setShowLoginModal(true);
  }, []);

  const requireSub = useCallback((message?: string) => {
    setSubMessage(message);
    setShowSubModal(true);
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") return;

      // Guest file size limit: 10MB
      if (!isLoggedIn && file.size > 10 * 1024 * 1024) {
        alert(
          "게스트는 10MB 이하의 PDF만 업로드할 수 있습니다. 로그인하면 더 큰 파일을 사용할 수 있습니다.",
        );
        return;
      }

      const chatId = generateChatId();
      await savePdfToLibrary(file, chatId);
      upsertLibraryMeta(file, chatId);
      if (!isLoggedIn) upsertSessionMeta(file, chatId);
      localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);

      // Navigate to the new chat URL
      router.push(`/chat/${chatId}`);
    },
    [router, isLoggedIn],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  /* ── Render ── */

  const hasPdf = !!openFile;
  const showPdf = hasPdf && (viewMode === "pdf" || viewMode === "both");
  const showChat = hasPdf && (viewMode === "chat" || viewMode === "both");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex h-screen bg-gray-50 flex-col${isChatResizing || isSidebarResizing ? " select-none cursor-col-resize" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* ── Header ── */}
      <header
        className="flex items-center justify-between h-11 px-3 border-b border-gray-200 bg-white shrink-0 z-30"
        style={{ boxShadow: "0 4px 6px 0 rgba(0,0,0,0.04)" }}
      >
        {/* Left */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => router.push("/")}
            className="font-bold text-sm text-gray-900 me-1 hover:text-blue-600 transition-colors"
          >
            LinguaRAG
          </button>
          <button
            onClick={() => setShowSidebar((v) => !v)}
            title="사이드바 열고 닫기"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
            </svg>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 border border-gray-300 rounded-md px-2 h-8 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 5v14M5 12h14"
              />
            </svg>
            New
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center min-w-0 px-4">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
            {activePdfName ?? "PDF를 선택하세요"}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1 shrink-0">
          {hasPdf && (
            <>
              <button
                onClick={() => setViewMode("pdf")}
                title="PDF만 보기"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "pdf"
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("both")}
                title="PDF + 채팅"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "both"
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v18"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("chat")}
                title="채팅만 보기"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "chat"
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                  />
                </svg>
              </button>
              <div className="w-px h-5 bg-gray-200 mx-1" />
            </>
          )}

          <button
            onClick={() => requireLogin()}
            className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            로그인
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        {showSidebar && (
          <aside
            className="bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 overflow-hidden relative"
            style={{ width: sidebarWidth }}
          >
            {/* Chats section */}
            <div className="px-1.5 py-2 shrink-0">
              <div className="flex items-center gap-1 px-1.5 py-1 text-sm text-gray-700 font-medium">
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                  />
                </svg>
                Chats
              </div>
              <div className="space-y-0.5">
                {hasPdf ? (
                  <div className="group flex items-center rounded-md bg-gray-200">
                    <button
                      className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1.5 text-xs truncate text-gray-900 font-medium"
                    >
                      <svg
                        className="w-3 h-3 text-red-400 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
                      </svg>
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRename()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename();
                            if (e.key === "Escape") setIsRenaming(false);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate bg-white border border-blue-400 rounded px-1 py-0 text-xs text-gray-900 outline-none w-full"
                        />
                      ) : (
                        <span className="truncate">{activePdfName}</span>
                      )}
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowCtxMenu((prev) => !prev);
                          setCtxMenuPos({ x: rect.left, y: rect.bottom + 4 });
                        }}
                        title="더보기"
                        className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-300 transition-all shrink-0"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                      {showCtxMenu && (
                        <div
                          ref={ctxMenuRef}
                          className="fixed z-50 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-xs"
                          style={{ left: ctxMenuPos.x, top: ctxMenuPos.y }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameValue(activePdfName ?? "");
                              setIsRenaming(true);
                              setShowCtxMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            이름 변경
                          </button>
                          <div className="h-px bg-gray-100 my-1" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCtxMenu(false);
                              handleDelete();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                    PDF를 추가해보세요
                  </p>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-200 mx-2 shrink-0" />

            {/* Folders section */}
            <div className="px-1.5 py-2 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between px-1.5 py-1 shrink-0">
                <div className="flex items-center gap-1 text-sm text-gray-700 font-medium">
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                    />
                  </svg>
                  Folders
                </div>
                <button
                  onClick={() => requireSub("폴더를 만들려면 Plus가 필요해요")}
                  title="새 폴더 만들기"
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 5v14M5 12h14"
                    />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                PDF를 추가하거나
                <br />
                폴더를 만들어보세요
              </p>
            </div>

            {/* Bottom */}
            <div className="pb-3 px-2 border-t border-gray-200 shrink-0">
              <button
                onClick={() => requireLogin()}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-gray-300 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  ?
                </div>
                <span className="text-xs text-gray-500 truncate flex-1 text-left">
                  로그인하기
                </span>
              </button>
            </div>

            {/* Sidebar resize handle */}
            <div
              onMouseDown={onSidebarDragHandleMouseDown}
              onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
              className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors ${
                isSidebarResizing ? "bg-blue-400" : "hover:bg-blue-300"
              }`}
            />
          </aside>
        )}

        {/* ── Main content area ── */}
        {hasPdf ? (
          <>
            {showPdf && (
              <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                <PdfViewer
                  ref={pdfViewerRef}
                  onTextSelect={setInjectText}
                  onPageChange={() => {
                    setHasPdfContext(true);
                    const total = pdfViewerRef.current?.getNumPages?.() ?? 0;
                    if (total > 0 && total !== pdfPageCount)
                      setPdfPageCount(total);
                  }}
                  speak={speak}
                  language={language}
                  onLanguageChange={setLanguage}
                  openFile={openFile}
                  onClose={() => router.push("/")}
                  pdfServerId={pdfServerId}
                  isGuest={!isLoggedIn}
                />
              </main>
            )}

            {/* PDF↔Chat drag handle */}
            {viewMode === "both" && (
              <div
                onMouseDown={onChatDragHandleMouseDown}
                onDoubleClick={() => setChatWidth(CHAT_DEFAULT)}
                className={`w-1 shrink-0 cursor-col-resize transition-colors ${
                  isChatResizing
                    ? "bg-blue-400"
                    : "bg-gray-200 hover:bg-blue-300"
                }`}
              />
            )}

            {/* Chat panel */}
            {showChat && (
              <section
                className={`flex flex-col overflow-hidden bg-white${viewMode === "both" ? " shrink-0" : " flex-1"}`}
                style={viewMode === "both" ? { width: chatWidth } : undefined}
              >
                <ChatPanel
                  pdfId={id}
                  pdfName={activePdfName ?? ""}
                  serverPdfId={pdfServerId}
                  injectText={injectText}
                  getPageText={async () =>
                    pdfViewerRef.current?.getPageText() ?? null
                  }
                  getPageNumber={() =>
                    pdfViewerRef.current?.getPageNumber() ?? null
                  }
                  hasPdfContext={hasPdfContext}
                  speak={speak}
                  isGuest={!isLoggedIn}
                />
              </section>
            )}
          </>
        ) : (
          /* PDF not found — show message */
          <main className="flex-1 flex flex-col items-center justify-center bg-white">
            <span className="text-4xl mb-4">📄</span>
            <p className="text-sm text-gray-600 font-medium mb-1">
              PDF를 찾을 수 없어요
            </p>
            <p className="text-xs text-gray-400 mb-4">
              이 브라우저에 저장된 PDF가 없습니다
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
            >
              홈으로 돌아가기
            </button>
          </main>
        )}
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-blue-500/10 pointer-events-none flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-xl border-2 border-blue-400 border-dashed">
            <p className="text-blue-600 font-medium text-sm">
              PDF를 여기에 놓으세요
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          message={loginMessage}
        />
      )}
      {showSubModal && (
        <SubscriptionModal
          onClose={() => setShowSubModal(false)}
          message={subMessage}
          onLogin={() => {
            setShowSubModal(false);
            requireLogin();
          }}
        />
      )}
    </div>
  );
}
