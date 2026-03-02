"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  queueSize: number;
  volume: number;
  onVolumeChange: (v: number) => void;
  injectText?: { text: string; id: number };
  hasPageContext?: boolean;
  onSummary?: () => void;
  showSummary?: boolean;
}

export default function InputBar({
  onSend,
  isStreaming,
  queueSize,
  volume,
  onVolumeChange,
  injectText,
  hasPageContext,
  onSummary,
  showSummary,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inject selected PDF text into the input
  useEffect(() => {
    if (!injectText) return;
    const injected = injectText.text;
    setValue(injected);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      el.focus();
    }, 0);
  }, [injectText?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {queueSize > 0 && (
        <p className="text-xs text-amber-600 text-center mb-2">
          {queueSize}개 대기 중
        </p>
      )}
      <div className="flex items-center justify-end gap-2 max-w-3xl mx-auto mb-2 text-gray-400">
        {/* Left group */}
        <div className="mr-auto flex items-center gap-2">
          {hasPageContext && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <svg
                className="w-3 h-3 shrink-0"
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
              페이지 컨텍스트 활성
            </span>
          )}
          {onSummary && !showSummary && (
            <button
              onClick={onSummary}
              disabled={isStreaming}
              title="대화 내용을 AI가 요약해줍니다"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              요약하기
            </button>
          )}
        </div>
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-20 h-1 accent-blue-500 cursor-pointer"
          title={`발음 볼륨: ${Math.round(volume * 100)}%`}
        />
        <span className="text-xs w-7 text-right">
          {Math.round(volume * 100)}%
        </span>
      </div>
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="독일어에 대해 질문해보세요... (Shift+Enter로 줄바꿈)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] max-h-40"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim()}
          className="shrink-0 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="전송"
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
              d="M12 19V5m0 0l-7 7m7-7l7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
