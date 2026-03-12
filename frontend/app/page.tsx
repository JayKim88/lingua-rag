"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  savePdfToLibrary,
  upsertLibraryMeta,
  upsertSessionMeta,
  getSessionMeta,
  generateChatId,
  LIBRARY_CURRENT_KEY,
  PdfMeta,
} from "@/lib/pdfLibrary";
import LoginModal from "@/components/LoginModal";
import SubscriptionModal from "@/components/SubscriptionModal";

/* ── Constants ────────────────────────────────────────────────────────── */

const FEATURES = [
  { emoji: "💬", title: "교재 맥락 AI 채팅", desc: '"이 페이지 설명해줘" 한마디면 끝' },
  { emoji: "🎤", title: "발음 연습", desc: "따라 읽고 정확도를 바로 확인" },
  { emoji: "📌", title: "메모 & 노트", desc: "PDF 위에 메모, AI 답변은 노트로 저장" },
  { emoji: "📝", title: "자동 요약", desc: "어휘·문법·핵심 문장을 AI가 정리" },
];

const LANGUAGES = [
  { flag: "🇩🇪", name: "Deutsch" },
  { flag: "🇺🇸", name: "English" },
  { flag: "🇫🇷", name: "Français" },
  { flag: "🇪🇸", name: "Español" },
  { flag: "🇮🇹", name: "Italiano" },
  { flag: "🇯🇵", name: "日本語" },
  { flag: "🇨🇳", name: "中文" },
  { flag: "🇧🇷", name: "Português" },
];

/* ── Component ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(true);

  // Drag-drop state
  const [isDragging, setIsDragging] = useState(false);

  // Modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>();
  const [showSubModal, setShowSubModal] = useState(false);
  const [subMessage, setSubMessage] = useState<string | undefined>();

  // Sidebar PDF list
  const [recentPdfs, setRecentPdfs] = useState<PdfMeta[]>([]);

  // Check auth on mount — redirect logged-in users to /chat
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        // Logged-in users see the full /chat page with landing content
        router.push("/chat");
        return;
      }
      // Guest: show per-tab PDFs from sessionStorage (new tab = empty)
      setRecentPdfs(getSessionMeta());
    });
  }, [router]);

  /* ── Helpers ── */

  const requireLogin = useCallback((message?: string) => {
    setLoginMessage(message);
    setShowLoginModal(true);
  }, []);

  const requireSub = useCallback((message?: string) => {
    setSubMessage(message);
    setShowSubModal(true);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") return;

    // Guest file size limit: 10MB
    if (!isLoggedIn && file.size > 10 * 1024 * 1024) {
      alert("게스트는 10MB 이하의 PDF만 업로드할 수 있습니다. 로그인하면 더 큰 파일을 사용할 수 있습니다.");
      return;
    }

    const chatId = generateChatId();
    await savePdfToLibrary(file, chatId);
    upsertLibraryMeta(file, chatId);
    // Guest: also save to sessionStorage for per-tab management
    if (!isLoggedIn) {
      upsertSessionMeta(file, chatId);
      setRecentPdfs(getSessionMeta());
    }
    localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);

    router.push(`/chat/${chatId}`);
  }, [router, isLoggedIn]);

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

  return (
    <div
      className="flex h-screen bg-gray-50 flex-col"
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
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-sm text-gray-900 me-1">LinguaRAG</span>
          <button
            onClick={() => setShowSidebar((v) => !v)}
            title="사이드바 열고 닫기"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
            </svg>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 border border-gray-300 rounded-md px-2 h-8 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        </div>

        <div className="flex-1 flex justify-center min-w-0 px-4">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
            PDF 기반 AI 언어 튜터
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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
        <aside className="bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 overflow-hidden w-60">
          {/* Chats section */}
          <div className="px-1.5 py-2 shrink-0">
            <div className="flex items-center gap-1 px-1.5 py-1 text-sm text-gray-700 font-medium">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Chats
            </div>
            {recentPdfs.length > 0 ? (
              <div className="space-y-0.5">
                {recentPdfs.map((meta) => (
                  <button
                    key={meta.chatId}
                    onClick={() => router.push(`/chat/${meta.chatId}`)}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1.5 text-xs truncate rounded-md hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    <svg className="w-3 h-3 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
                    </svg>
                    <span className="truncate">{meta.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                PDF를 추가해보세요
              </p>
            )}
          </div>

          <div className="h-px bg-gray-200 mx-2 shrink-0" />

          {/* Folders section */}
          <div className="px-1.5 py-2 flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-1.5 py-1 shrink-0">
              <div className="flex items-center gap-1 text-sm text-gray-700 font-medium">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Folders
              </div>
              <button
                onClick={() => requireSub("폴더를 만들려면 Plus가 필요해요")}
                title="새 폴더 만들기"
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
              PDF를 추가하거나<br />폴더를 만들어보세요
            </p>
          </div>

          {/* Bottom: login prompt or library link */}
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
        </aside>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
          <div className="flex-1 overflow-y-auto">
            {/* Upload drop zone */}
            <div className="flex flex-col items-center justify-center px-6 pt-16 pb-10">
              <div className="mb-6">
                <span className="text-5xl">📚</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3 leading-tight">
                내 교재로 배우는{" "}
                <span className="bg-linear-to-r from-blue-600 via-purple-500 to-amber-500 bg-clip-text text-transparent">
                  AI 언어 튜터
                </span>
              </h1>
              <p className="text-gray-500 text-center mb-8 max-w-md text-sm leading-relaxed">
                PDF 교재를 올리면, AI가 교재 내용을 기반으로
                <br />
                질문에 답해주고, 발음도 연습시켜 줘요.
              </p>

              {/* Drop zone */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-md flex flex-col items-center gap-3 px-6 py-10 rounded-2xl border-2 border-dashed transition-all group cursor-pointer ${
                  isDragging
                    ? "border-blue-500 bg-blue-50/70 scale-[1.02]"
                    : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/50"
                }`}
              >
                <svg
                  className={`w-10 h-10 transition-colors ${
                    isDragging ? "text-blue-500" : "text-gray-300 group-hover:text-blue-400"
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className={`text-sm font-medium transition-colors ${
                  isDragging ? "text-blue-600" : "text-gray-500 group-hover:text-blue-600"
                }`}>
                  {isDragging ? "여기에 놓으세요" : "PDF 파일을 업로드하세요"}
                </span>
                <span className="text-xs text-gray-400">
                  로그인 없이 바로 시작 · 어떤 언어 교재든 OK
                </span>
              </button>
            </div>

            {/* Language bar */}
            <div className="flex items-center justify-center gap-4 flex-wrap px-6 py-4 border-y border-gray-100 bg-gray-50/50 mx-6 rounded-xl mb-8">
              {LANGUAGES.map((lang) => (
                <div key={lang.name} className="flex items-center gap-1 text-gray-500">
                  <span className="text-base">{lang.flag}</span>
                  <span className="text-xs font-medium">{lang.name}</span>
                </div>
              ))}
            </div>

            {/* Selection popup demo */}
            <div className="px-6 pb-8">
              <div className="max-w-md mx-auto">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 text-center">
                  드래그 한 번이면 끝
                </p>
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Ich möchte einen Kaffee,{" "}
                    <span className="bg-yellow-200/70 px-0.5 rounded">bitte</span>.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { icon: "🔊", label: "소리" },
                      { icon: "📋", label: "복사" },
                      { icon: "🌐", label: "번역" },
                      { icon: "💬", label: "질문" },
                      { icon: "🎤", label: "연습" },
                    ].map((a) => (
                      <span
                        key={a.label}
                        className="px-2.5 py-1 rounded-full bg-white text-xs text-gray-600 font-medium border border-gray-200 shadow-sm"
                      >
                        {a.icon} {a.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature grid */}
            <div className="px-6 pb-12">
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                  >
                    <span className="text-xl mb-2 block">{f.emoji}</span>
                    <h3 className="text-xs font-semibold text-gray-800 mb-0.5">{f.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Global drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-blue-500/10 pointer-events-none flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-xl border-2 border-blue-400 border-dashed">
            <p className="text-blue-600 font-medium text-sm">PDF를 여기에 놓으세요</p>
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
