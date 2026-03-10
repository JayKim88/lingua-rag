"use client";

import { useState } from "react";

export interface SelectionPopupProps {
  x: number;
  y: number;
  text: string;
  speak: (text: string) => void;
  onAsk: (payload: { text: string; id: number }) => void;
  onPractice: (text: string) => void;
  onClose: () => void;
}

/**
 * Floating action popup that appears after text selection.
 * Provides 소리 / 복사 / 번역 / 질문하기 / 연습 actions.
 */
export default function SelectionPopup({
  x,
  y,
  text,
  speak,
  onAsk,
  onPractice,
  onClose,
}: SelectionPopupProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const dismiss = () => {
    onClose();
    window.getSelection()?.removeAllRanges();
  };

  const handleTranslate = async () => {
    if (translation !== null) {
      setTranslation(null);
      return;
    }
    setIsTranslating(true);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=de|ko`;
      const res = await fetch(url);
      const data = await res.json();
      setTranslation(data?.responseData?.translatedText ?? "번역 실패");
    } catch {
      setTranslation("번역 오류");
    } finally {
      setIsTranslating(false);
    }
  };

  const top = y - 52 < 8 ? y + 20 : y - 52;

  return (
    <div
      id="selection-popup"
      className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden flex flex-col"
      style={{
        left: Math.min(x - 4, window.innerWidth - 260),
        top,
      }}
    >
      {/* Action buttons row */}
      <div className="flex">
        {/* 소리 */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { speak(text); dismiss(); }}
          className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
          title="소리 내어 읽기"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          소리
        </button>
        <div className="w-px bg-gray-200" />
        {/* 복사 */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { navigator.clipboard.writeText(text); dismiss(); }}
          className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
          title="클립보드에 복사"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          복사
        </button>
        <div className="w-px bg-gray-200" />
        {/* 번역 */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleTranslate}
          disabled={isTranslating}
          className={`px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${
            translation !== null
              ? "bg-green-50 text-green-700"
              : "text-green-700 hover:bg-green-50 active:bg-green-100 active:scale-95"
          } disabled:opacity-60`}
          title="독일어 → 한국어 번역"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          {isTranslating ? "..." : "번역"}
        </button>
        <div className="w-px bg-gray-200" />
        {/* 질문하기 */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onAsk({ text, id: Date.now() }); dismiss(); }}
          className="px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-200 active:scale-95 transition-all flex items-center gap-1.5"
          title="질문하기"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          질문하기
        </button>
        <div className="w-px bg-gray-200" />
        {/* 연습 */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onPractice(text); dismiss(); }}
          className="px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 active:bg-purple-200 active:scale-95 transition-all flex items-center gap-1.5"
          title="발음 연습"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          연습
        </button>
      </div>

      {/* Translation result row */}
      {translation !== null && (
        <>
          <div className="h-px bg-gray-100" />
          <div className="px-3 py-2 flex items-start gap-2 max-w-xs">
            <span className="text-[10px] text-green-600 font-semibold shrink-0 mt-0.5">KO</span>
            <p className="text-xs text-gray-800 leading-relaxed wrap-break-word">{translation}</p>
          </div>
        </>
      )}
    </div>
  );
}
