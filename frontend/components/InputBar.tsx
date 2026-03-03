"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isStreaming: boolean;
  queueSize: number;
  injectText?: { text: string; id: number };
  hasPageContext?: boolean;
  onSummary?: () => void;
  onMemo?: () => void;
  showSummary?: boolean;
}

export default function InputBar({
  onSend,
  onCancel,
  isStreaming,
  queueSize,
  injectText,
  hasPageContext,
  onSummary,
  onMemo,
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
            <span className="relative group/ctx flex items-center gap-1 text-xs text-blue-500">
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
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-56 rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover/ctx:opacity-100 z-50">
                현재 PDF 페이지 이미지가 AI에게 함께 전달됩니다. AI가 교재 내용을 직접 보며 답변할 수 있습니다.
              </span>
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
          {onMemo && !showSummary && (
            <button
              onClick={onMemo}
              title="직접 메모를 작성합니다"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
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
                  d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z"
                />
              </svg>
              메모하기
            </button>
          )}
        </div>
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
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            aria-label="취소"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
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
        )}
      </div>
    </div>
  );
}
