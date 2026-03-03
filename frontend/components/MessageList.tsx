"use client";

import { useState, useRef, useContext, createContext, Children, isValidElement } from "react";
import { Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

// ---------------------------------------------------------------------------
// Context — passes speak/onInject into stable module-level component defs
// ---------------------------------------------------------------------------
export const ChatActionsCtx = createContext<{
  speak: (text: string) => void;
  onInject: (text: string) => void;
} | null>(null);

// ---------------------------------------------------------------------------
// Split React children at every <br> element → array of line segments
// ---------------------------------------------------------------------------
function splitAtBreaks(children: React.ReactNode): React.ReactNode[][] {
  const segments: React.ReactNode[][] = [[]];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "br") {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(child);
    }
  });
  return segments.filter((seg) =>
    seg.some((c) => (typeof c === "string" ? c.trim() !== "" : c !== null && c !== undefined))
  );
}

// ---------------------------------------------------------------------------
// Split a line's nodes at the first "→" found in a string node.
// Returns { primary: ReactNode[], secondary: ReactNode[] | null }
// primary  = German part (before "→")  → gets action buttons
// secondary = "→ Korean..." part        → rendered plain after the buttons
// ---------------------------------------------------------------------------
function splitAtArrow(
  nodes: React.ReactNode[]
): { primary: React.ReactNode[]; secondary: React.ReactNode[] | null } {
  const primary: React.ReactNode[] = [];
  const secondary: React.ReactNode[] = [];
  let split = false;

  for (const node of nodes) {
    if (split) { secondary.push(node); continue; }
    if (typeof node === "string") {
      const idx = node.indexOf("→");
      if (idx !== -1) {
        if (idx > 0) primary.push(node.slice(0, idx));
        secondary.push(node.slice(idx)); // keep "→" in secondary
        split = true;
      } else {
        primary.push(node);
      }
    } else {
      primary.push(node); // bold/em elements always go to primary
    }
  }

  return { primary, secondary: split ? secondary : null };
}

// ---------------------------------------------------------------------------
// Single rendered line: [primaryRef + action buttons] [optional secondary]
// primaryRef captures the German text; buttons operate only on that text.
// ---------------------------------------------------------------------------
function LineWithActions({ children }: { children: React.ReactNode }) {
  const ctx = useContext(ChatActionsCtx);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const primaryRef = useRef<HTMLSpanElement>(null);

  const nodesArray = Children.toArray(children);
  const { primary, secondary } = splitAtArrow(nodesArray);

  // Only treat as split when there is actual content before "→"
  const hasSplit = secondary !== null && primary.length > 0;

  const getText = () => {
    const el = primaryRef.current;
    if (!el) return "";
    const raw = el.textContent?.trim() ?? "";
    // Strip speaker prefix: "A: ", "B: " etc. (single uppercase letter + colon)
    const base = raw.replace(/^[A-Z]:\s*/, "").trim() || raw;

    // If no Korean in the text, return as-is
    const KOREAN_RE = /[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]/;
    if (!KOREAN_RE.test(base)) return base;

    // Mixed Korean+German: prefer bold/em elements that contain Latin text
    const STRIP_KOREAN = (t: string) =>
      t.replace(/[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]+/g, " ").replace(/\s+/g, " ").trim();
    const boldEls = Array.from(el.querySelectorAll("strong, em"));
    const germanBold = boldEls
      .map((b) => {
        const t = b.textContent?.trim() ?? "";
        return KOREAN_RE.test(t) ? STRIP_KOREAN(t) : t;
      })
      .filter((t) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(t))
      .join(" ")
      .trim();
    if (germanBold) return germanBold;

    // Fallback: strip Korean characters from the full text
    return base
      .replace(/[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleCopy = () => {
    const text = getText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="mb-0.5 last:mb-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Primary text (German sentence) captured via ref */}
      <span ref={primaryRef}>{hasSplit ? primary : children}</span>

      {/*
        Zero-width inline anchor — takes no layout space.
        The absolutely-positioned button strip starts here and overlays
        whatever follows (Korean translation or line end).
      */}
      <span className="inline-block w-0 relative">
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                      bg-white border border-gray-100 rounded-lg shadow-sm px-1.5 py-0.5
                      z-30 whitespace-nowrap transition-opacity
                      ${hovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {/* TTS */}
          <button
            onClick={() => ctx?.speak(getText())}
            title="발음 듣기"
            className="p-0.5 rounded text-gray-400 hover:text-blue-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            title="복사"
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
          >
            {copied ? (
              <span className="text-[9px] font-medium text-green-600">복사됨</span>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {/* Inject to input */}
          <button
            onClick={() => ctx?.onInject(getText())}
            title="입력창에 사용"
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19H6a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l3 3m0 0l3-3m-3 3v-6" />
            </svg>
          </button>
        </span>
      </span>

      {/* Korean translation rendered after the zero-width anchor */}
      {hasSplit && <span className="text-gray-500">{secondary}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paragraph renderer: splits at <br> → one LineWithActions per line
// ---------------------------------------------------------------------------
function ParagraphRenderer({ children }: { children: React.ReactNode }) {
  const segments = splitAtBreaks(children);
  if (segments.length === 0) return null;

  return (
    <div className="mb-1 last:mb-0">
      {segments.map((seg, i) => (
        <LineWithActions key={i}>{seg}</LineWithActions>
      ))}
    </div>
  );
}

// Stable module-level component map
export const MARKDOWN_COMPONENTS: Partial<Components> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  p: ({ node: _node, ...props }) => <ParagraphRenderer>{props.children}</ParagraphRenderer>,
};

// ---------------------------------------------------------------------------
// User-message copy button
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 text-blue-200 hover:text-white p-1 rounded"
      title="복사"
    >
      {copied ? (
        <span className="text-[10px] font-medium text-green-300">복사됨</span>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Date separator
// ---------------------------------------------------------------------------
function toDateKey(iso: string) { return iso.slice(0, 10); }

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "오늘";
  if (sameDay(date, yesterday)) return "어제";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save summary button — shown below isSummary assistant messages
// ---------------------------------------------------------------------------
function SaveSummaryButton({ content, onSave }: { content: string; onSave?: (c: string) => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      onClick={() => {
        onSave?.(content);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
      className={`mt-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
        saved
          ? "border-green-200 bg-green-50 text-green-600"
          : "border-gray-200 text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
      }`}
    >
      {saved ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          저장됨
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          요약 저장
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------
interface MessageListProps {
  messages: Message[];
  speak: (text: string) => void;
  onInject: (text: string) => void;
  onSaveSummary?: (content: string) => void;
}

export default function MessageList({ messages, speak, onInject, onSaveSummary }: MessageListProps) {
  let lastDateKey = "";

  return (
    <ChatActionsCtx.Provider value={{ speak, onInject }}>
      <div className="space-y-4">
        {messages.map((msg) => {
          let separator: React.ReactNode = null;
          if (msg.createdAt) {
            const dateKey = toDateKey(msg.createdAt);
            if (dateKey !== lastDateKey) {
              separator = <DateSeparator key={`sep-${dateKey}`} label={formatDateLabel(msg.createdAt)} />;
              lastDateKey = dateKey;
            }
          }

          return (
            <div key={msg.id}>
              {separator}
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  {msg.isSummaryRequest ? (
                    // Summary request — compact pill instead of full prompt
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      대화 요약 요청
                    </div>
                  ) : (
                    <div className="relative group max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-blue-600 text-white rounded-br-sm">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {!msg.isStreaming && msg.content && <CopyButton text={msg.content} />}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-start">
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed rounded-bl-sm shadow-sm ${
                    msg.isSummary
                      ? "bg-blue-50 border border-blue-200 text-gray-800"
                      : "bg-white border border-gray-200 text-gray-800"
                  }`}>
                    <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-strong:text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MARKDOWN_COMPONENTS}>
                        {msg.content}
                      </ReactMarkdown>
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                      )}
                      {msg.isTruncated && !msg.isStreaming && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠ 응답이 길어져 일부 잘렸습니다. 더 구체적으로 나눠서 질문해 보세요.
                        </p>
                      )}
                    </div>
                    {msg.isSummary && !msg.isStreaming && (
                      <SaveSummaryButton content={msg.content} onSave={onSaveSummary} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChatActionsCtx.Provider>
  );
}
