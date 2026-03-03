"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ChatPanel from "@/components/ChatPanel";
import { UNITS } from "@/lib/types";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useTTS } from "@/hooks/useTTS";
import { createClient } from "@/lib/supabase/client";
import {
  getLibraryMeta,
  loadPdfFromLibrary,
  deletePdfFromLibrary,
  removeLibraryMeta,
  type PdfMeta,
} from "@/lib/pdfLibrary";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
});

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;

const CHAT_MIN = 280;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 560;

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const unitParam = searchParams.get("unit");
  const levelParam = searchParams.get("level") as "A1" | "A2" | null;

  const [initialized, setInitialized] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>("A1-1");
  const [level, setLevel] = useState<"A1" | "A2">("A1");
  const [visitedUnits, setVisitedUnits] = useState<Set<string>>(new Set());
  const [showPdf, setShowPdf] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [modalLib, setModalLib] = useState<PdfMeta[]>([]);
  const [openFile, setOpenFile] = useState<File | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null,
  );
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // PDF text injection state — uses id to re-trigger same text
  const [injectText, setInjectText] = useState<
    { text: string; id: number } | undefined
  >();
  // Current PDF page image (base64 JPEG) — passed to Claude as visual context
  const [pageImage, setPageImage] = useState<string | null>(null);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Chat panel resize state
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT);
  const [isChatResizing, setIsChatResizing] = useState(false);
  const isChatResizingRef = useRef(false);
  const chatDragStartX = useRef(0);
  const chatDragStartWidth = useRef(0);

  const healthStatus = useBackendHealth();
  const { speak, volume, setVolume, rate, setRate } = useTTS();
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [draftVolume, setDraftVolume] = useState(volume);
  const [draftRate, setDraftRate] = useState(rate);

  // Initialize from URL params or localStorage (run once on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedUnit = localStorage.getItem("lingua_unit");
    const savedLevel = localStorage.getItem("lingua_level") as
      | "A1"
      | "A2"
      | null;
    const unit = unitParam ?? savedUnit ?? "A1-1";
    const lvl = levelParam ?? savedLevel ?? "A1";
    setSelectedUnit(unit);
    setLevel(lvl as "A1" | "A2");
    setVisitedUnits(new Set([unit]));
    setShowPdf(localStorage.getItem("lingua_show_pdf") === "true");
    setInitialized(true);
  }, []);

  // Fetch user info
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          name:
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "User",
          email: user.email ?? "",
        });
      }
    });
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  // Persist to localStorage on unit/level/pdf change
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem("lingua_unit", selectedUnit);
    localStorage.setItem("lingua_level", level);
    localStorage.setItem("lingua_show_pdf", String(showPdf));
  }, [selectedUnit, level, showPdf, initialized]);

  // Sidebar drag-to-resize
  const onDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      setIsResizing(true);
      dragStartX.current = e.clientX;
      dragStartWidth.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  // Chat panel drag-to-resize (drag from left edge of chat panel)
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
      if (isResizingRef.current) {
        const delta = e.clientX - dragStartX.current;
        const next = Math.max(
          SIDEBAR_MIN,
          Math.min(SIDEBAR_MAX, dragStartWidth.current + delta),
        );
        setSidebarWidth(next);
      }
      if (isChatResizingRef.current) {
        // Dragging left increases chat width (delta is negative when moving left)
        const delta = chatDragStartX.current - e.clientX;
        const next = Math.max(
          CHAT_MIN,
          Math.min(CHAT_MAX, chatDragStartWidth.current + delta),
        );
        setChatWidth(next);
      }
    };
    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
      }
      if (isChatResizingRef.current) {
        isChatResizingRef.current = false;
        setIsChatResizing(false);
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const currentUnit = UNITS.find((u) => u.id === selectedUnit);
  const textbookId = level === "A2" ? "dokdokdok-a2" : "dokdokdok-a1";

  const initials =
    user?.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnit(unitId);
    setVisitedUnits((prev) => {
      if (prev.has(unitId)) return prev;
      return new Set([...prev, unitId]);
    });
  };

  const isAnyResizing = isResizing || isChatResizing;

  return (
    <div
      className={`flex h-screen bg-gray-50 flex-col${isAnyResizing ? " select-none cursor-col-resize" : ""}`}
    >
      {/* Cold start banner */}
      {(healthStatus === "warming" || healthStatus === "error") && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {healthStatus === "warming"
            ? "서버가 시작 중입니다. 첫 응답까지 30~60초가 걸릴 수 있습니다."
            : "서버에 연결할 수 없습니다. 잠시 후 새로고침 해주세요."}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="bg-white border-r border-gray-200 flex flex-col shrink-0"
          style={{ width: sidebarWidth }}
        >
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-900">LinguaRAG</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              독독독 {level} · 독일어 학습
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((band) => {
              const bandUnits = UNITS.filter((u) => u.band === band);
              if (bandUnits.length === 0) return null;
              const bandName = bandUnits[0]?.band_name ?? "";
              return (
                <div key={band} className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 px-2 mb-1">
                    Band {band} · {bandName}
                  </p>
                  {bandUnits.map((unit) => (
                    <button
                      key={unit.id}
                      onClick={() => handleSelectUnit(unit.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-1 ${
                        selectedUnit === unit.id
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-xs text-gray-400 mr-1 shrink-0">
                        {unit.id}
                      </span>
                      <span className="flex-1 truncate">{unit.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          <div className="p-3 border-t border-gray-100">
            {/* User card */}
            <div ref={userMenuRef} className="relative">
              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setDraftVolume(volume);
                        setDraftRate(rate);
                        setShowSoundModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-3.5 h-3.5 text-gray-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                      소리 설정
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        localStorage.removeItem("lingua_unit");
                        localStorage.removeItem("lingua_level");
                        router.push("/");
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-3.5 h-3.5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      레벨 재선택
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      로그아웃
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <span className="text-sm text-gray-700 truncate flex-1 text-left">
                  {user?.name ?? "…"}
                </span>
              </button>
            </div>
          </div>
        </aside>

        {/* Sidebar drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className={`w-1 shrink-0 cursor-col-resize transition-colors ${
            isResizing ? "bg-blue-400" : "bg-gray-200 hover:bg-blue-300"
          }`}
        />

        {/* PDF viewer area — optional */}
        {showPdf && (
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            {initialized && (
              <PdfViewer
                onTextSelect={setInjectText}
                onPageImageChange={setPageImage}
                speak={speak}
                openFile={openFile}
                onClose={() => {
                  setShowPdf(false);
                  setPageImage(null);
                }}
              />
            )}
          </main>
        )}

        {/* PDF↔Chat drag handle — only when PDF is open */}
        {showPdf && (
          <div
            onMouseDown={onChatDragHandleMouseDown}
            onDoubleClick={() => setChatWidth(CHAT_DEFAULT)}
            className={`w-1 shrink-0 cursor-col-resize transition-colors ${
              isChatResizing ? "bg-blue-400" : "bg-gray-200 hover:bg-blue-300"
            }`}
          />
        )}

        {/* Chat panel */}
        <section
          className={`flex flex-col overflow-hidden bg-white${showPdf ? " shrink-0" : " flex-1"}`}
          style={showPdf ? { width: chatWidth } : undefined}
        >
          <header className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">
                  {currentUnit?.title ?? "단원 선택"}
                </h2>
                <p className="text-xs text-gray-500">
                  {currentUnit?.topics.join(" · ") ?? ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setModalLib(getLibraryMeta());
                  setShowPdfModal(true);
                }}
                title="PDF 보기"
                className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors shrink-0"
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                PDF 보기
              </button>
              <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
                {level}
              </span>
            </div>
          </header>

          {/* Persistent chat panels */}
          {initialized &&
            UNITS.filter((u) => visitedUnits.has(u.id)).map((unit) => (
              <div
                key={unit.id}
                className="flex-1 flex flex-col overflow-hidden"
                style={{
                  display: unit.id === selectedUnit ? undefined : "none",
                }}
              >
                <ChatPanel
                  unitId={unit.id}
                  level={level}
                  textbookId={textbookId}
                  injectText={injectText}
                  pageImage={pageImage}
                  speak={speak}
                />
              </div>
            ))}
        </section>
      </div>

      {/* Sound settings modal */}
      {showSoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-900">소리 설정</h3>
              <button
                onClick={() => setShowSoundModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
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

            <div className="space-y-5">
              {/* Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-600">크기</label>
                  <span className="text-sm font-medium text-gray-800 w-10 text-right">
                    {Math.round(draftVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draftVolume}
                  onChange={(e) => setDraftVolume(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Rate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-600">속도</label>
                  <span className="text-sm font-medium text-gray-800 w-10 text-right">
                    {draftRate.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={draftRate}
                  onChange={(e) => setDraftRate(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>느림</span>
                  <span>빠름</span>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  if (typeof window === "undefined" || !window.speechSynthesis) return;
                  window.speechSynthesis.cancel();
                  const utt = new SpeechSynthesisUtterance("Guten Morgen! Wie geht es Ihnen?");
                  utt.lang = "de-DE";
                  utt.volume = draftVolume;
                  utt.rate = draftRate;
                  window.speechSynthesis.speak(utt);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
                테스트
              </button>
              <button
                onClick={() => {
                  setVolume(draftVolume);
                  setRate(draftRate);
                  setShowSoundModal(false);
                }}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF picker modal */}
      {showPdfModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPdfModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">PDF 열기</h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
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

            {/* Upload area */}
            <div className="px-5 pt-4">
              <input
                ref={modalFileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setOpenFile(f);
                  setShowPdf(true);
                  setShowPdfModal(false);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => modalFileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
              >
                <svg
                  className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">
                  PDF 파일 선택
                </span>
              </button>
            </div>

            {/* Recent files list */}
            {modalLib.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-400 mb-2">
                  최근 사용한 파일
                </p>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {modalLib.map((meta) => (
                    <div
                      key={meta.name}
                      className="flex items-center gap-1 group"
                    >
                      <button
                        onClick={async () => {
                          const f = await loadPdfFromLibrary(meta.name);
                          if (!f) return;
                          setOpenFile(f);
                          setShowPdf(true);
                          setShowPdfModal(false);
                        }}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left min-w-0"
                      >
                        <svg
                          className="w-4 h-4 text-red-400 shrink-0"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {meta.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {meta.lastOpened
                              ? new Date(meta.lastOpened).toLocaleDateString(
                                  "ko-KR",
                                  { month: "short", day: "numeric" },
                                )
                              : ""}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await deletePdfFromLibrary(meta.name);
                          setModalLib(removeLibraryMeta(meta.name));
                        }}
                        title="목록에서 삭제"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
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
                  ))}
                </div>
              </div>
            )}

            {modalLib.length === 0 && (
              <p className="text-xs text-gray-400 text-center pb-5 pt-2">
                이전에 사용한 파일이 없습니다
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  );
}
