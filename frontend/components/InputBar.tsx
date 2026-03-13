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
  disabled?: boolean;
  /** Called when user interacts with the input while disabled (e.g. to show paywall) */
  onDisabledClick?: () => void;
}

export default function InputBar({
  onSend,
  onCancel,
  isStreaming,
  queueSize,
  injectText,
  hasPageContext,
  onSummary,
  disabled,
  onDisabledClick,
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
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      el.focus();
    }, 0);
  }, [injectText?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    if (disabled) return;
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
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const showActionButtons = hasPageContext || onSummary;

  return (
    <div className="bg-white px-3 py-3">
      {queueSize > 0 && (
        <p className="text-xs text-amber-600 text-center mb-2">
          {queueSize}개 대기 중
        </p>
      )}

      <div
        className={`max-w-3xl mx-auto rounded-2xl border transition-colors ${
          disabled
            ? "border-gray-200 bg-gray-50"
            : "border-gray-200 bg-white shadow-sm focus-within:border-blue-400 focus-within:shadow-md"
        }`}
        onClick={disabled && onDisabledClick ? onDisabledClick : undefined}
      >
        {/* Action buttons row — inside the container */}
        {showActionButtons && (
          <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
            {hasPageContext && (
              <span className="relative group/ctx inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
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
                PDF 연결됨
                <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-56 rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-normal text-white opacity-0 transition-opacity group-hover/ctx:opacity-100 z-50">
                  &ldquo;이 페이지&rdquo;를 포함하여 질문하면 현재 PDF 페이지 텍스트가 AI에게 함께 전달됩니다.
                </span>
              </span>
            )}
            {onSummary && (
              <button
                onClick={onSummary}
                disabled={isStreaming}
                title="대화 내용을 AI가 요약해줍니다"
                className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
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
                요약
              </button>
            )}
          </div>
        )}

        {/* Textarea + send button row */}
        <div className="flex items-end gap-2 p-2.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={disabled ? "메시지 한도에 도달했습니다" : "교재 내용에 대해 질문해보세요..."}
            rows={2}
            className={`flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus:outline-none min-h-13 max-h-50 placeholder-gray-400${disabled ? " text-gray-400 cursor-pointer" : " text-gray-800"}`}
          />
          {isStreaming ? (
            <button
              onClick={onCancel}
              className="shrink-0 w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
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
              className="shrink-0 w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              aria-label="전송"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Hint text */}
        {!disabled && (
          <div className="px-4 pb-2 -mt-1">
            <p className="text-[11px] text-gray-300">
              Shift+Enter로 줄바꿈
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
