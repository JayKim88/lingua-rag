"use client";

import {
  useState,
  useRef,
  useEffect,
  useContext,
  createContext,
  Children,
  isValidElement,
} from "react";
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
  onPractice: (text: string) => void;
  selectionPopup: { x: number; y: number; text: string } | null;
  setSelectionPopup: (p: { x: number; y: number; text: string } | null) => void;
  hoverBlocked: boolean;
  clearHoverBlock: () => void;
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
    seg.some((c) =>
      typeof c === "string" ? c.trim() !== "" : c !== null && c !== undefined,
    ),
  );
}

// ---------------------------------------------------------------------------
// Split a line's nodes at the first "→" found in a string node.
// Returns { primary: ReactNode[], secondary: ReactNode[] | null }
// primary  = German part (before "→")  → gets action buttons
// secondary = "→ Korean..." part        → rendered plain after the buttons
// ---------------------------------------------------------------------------
function splitAtArrow(nodes: React.ReactNode[]): {
  primary: React.ReactNode[];
  secondary: React.ReactNode[] | null;
} {
  const primary: React.ReactNode[] = [];
  const secondary: React.ReactNode[] = [];
  let split = false;

  for (const node of nodes) {
    if (split) {
      secondary.push(node);
      continue;
    }
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
// Split nodes at the first Korean/CJK character boundary.
// Returns { latin: ReactNode[], rest: ReactNode[] | null }
// ---------------------------------------------------------------------------
const KOREAN_CJK_RE = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u30FF]/;

function splitAtKorean(nodes: React.ReactNode[]): {
  latin: React.ReactNode[];
  rest: React.ReactNode[] | null;
} {
  const latin: React.ReactNode[] = [];
  const rest: React.ReactNode[] = [];
  let split = false;

  for (const node of nodes) {
    if (split) {
      rest.push(node);
      continue;
    }
    if (typeof node === "string") {
      const match = node.search(KOREAN_CJK_RE);
      if (match !== -1) {
        // Trim trailing whitespace from Latin portion
        const before = node.slice(0, match).replace(/\s+$/, "");
        if (before) latin.push(before);
        rest.push(node.slice(match));
        split = true;
      } else {
        latin.push(node);
      }
    } else {
      // React elements (strong, em): check textContent via toString heuristic
      // Keep in latin portion — they're usually German markup
      latin.push(node);
    }
  }

  return { latin, rest: split ? rest : null };
}

// ---------------------------------------------------------------------------
// Extract speaker prefix ("A: ", "B: ", etc.) from the first string node
// Returns { prefix: string | null, nodes: ReactNode[] }
// ---------------------------------------------------------------------------
const SPEAKER_PREFIX_RE = /^([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]*:\s*)/;
const SPEAKER_LABEL_RE = /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]*:$/;

/** Recursively extract text content from a React node */
function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (isValidElement(node)) {
    const children = (node.props as Record<string, unknown>).children;
    if (Array.isArray(children)) return children.map(getNodeText).join("");
    return getNodeText(children as React.ReactNode);
  }
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  return "";
}

function extractSpeakerPrefix(nodes: React.ReactNode[]): {
  prefix: React.ReactNode[] | null;
  nodes: React.ReactNode[];
} {
  if (nodes.length === 0) return { prefix: null, nodes };

  // Skip leading whitespace-only string nodes (e.g., "\n")
  const prefixNodes: React.ReactNode[] = [];
  let startIdx = 0;
  while (startIdx < nodes.length) {
    const n = nodes[startIdx];
    if (typeof n === "string" && n.trim() === "") {
      prefixNodes.push(n);
      startIdx++;
    } else {
      break;
    }
  }

  if (startIdx >= nodes.length) return { prefix: null, nodes };
  const first = nodes[startIdx];

  // Case 1: first meaningful node is a string like "B: Woher..."
  if (typeof first === "string") {
    const m = first.match(SPEAKER_PREFIX_RE);
    if (m) {
      prefixNodes.push(m[1]);
      const rest = first.slice(m[1].length);
      const remaining = rest
        ? [rest, ...nodes.slice(startIdx + 1)]
        : nodes.slice(startIdx + 1);
      return { prefix: prefixNodes, nodes: remaining };
    }
  }

  // Case 2: first meaningful node is a React element like <strong>B:</strong>
  if (isValidElement(first)) {
    const childText = getNodeText(first).trim();
    if (childText && SPEAKER_LABEL_RE.test(childText)) {
      prefixNodes.push(first, " ");
      const rest = [...nodes.slice(startIdx + 1)];
      // Trim leading whitespace from next string node
      if (rest.length > 0 && typeof rest[0] === "string") {
        rest[0] = (rest[0] as string).replace(/^\s+/, "");
        if (!rest[0]) rest.shift();
      }
      return { prefix: prefixNodes, nodes: rest };
    }
  }

  return { prefix: null, nodes };
}

// ---------------------------------------------------------------------------
// Single rendered line: [primaryRef + action buttons] [optional secondary]
// primaryRef captures the German text; buttons operate only on that text.
// ---------------------------------------------------------------------------
function LineWithActions({ children }: { children: React.ReactNode }) {
  const ctx = useContext(ChatActionsCtx);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasGerman, setHasGerman] = useState(false);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const primaryRef = useRef<HTMLSpanElement>(null);
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodesArray = Children.toArray(children);


  const { primary, secondary } = splitAtArrow(nodesArray);

  // Only treat as split when there is actual content before "→"
  const hasSplit = secondary !== null && primary.length > 0;

  // Always split at Korean boundary — works for both arrow-split and non-split lines
  const baseNodes = hasSplit ? primary : nodesArray;
  const koreanSplit = splitAtKorean(baseNodes);
  const hasKoreanTail =
    koreanSplit.rest !== null && koreanSplit.latin.length > 0;

  // Use Korean-filtered latin part if available, otherwise use base nodes
  const contentNodes = hasKoreanTail ? koreanSplit.latin : baseNodes;
  const { prefix: speakerPrefix, nodes: highlightNodes } =
    extractSpeakerPrefix(contentNodes);

  // Check if line contains German (Latin) text — from DOM after mount
  useEffect(() => {
    const text = primaryRef.current?.textContent ?? "";
    setHasGerman(/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(text));
  }, [children]);

  const getText = () => {
    const el = primaryRef.current;
    if (!el) return "";
    const raw = el.textContent?.trim() ?? "";
    // Strip speaker prefix: "A: ", "Leo: " etc.
    const base = raw.replace(/^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]*:\s*/, "").trim() || raw;

    // If no Korean in the text, return as-is
    const KOREAN_RE = /[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]/;
    if (!KOREAN_RE.test(base)) return base;

    // Mixed Korean+German: prefer bold/em elements that contain Latin text
    const STRIP_KOREAN = (t: string) =>
      t
        .replace(/[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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

    // Fallback: extract Latin word sequences (German words in Korean-medium text)
    const latinWords = base.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]+/g) ?? [];
    return latinWords.join(" ");
  };

  const handleCopy = () => {
    const text = getText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Hover only on German lines, suppressed when selection popup is active or hover is blocked
  const blocked = !!ctx?.selectionPopup || !!ctx?.hoverBlocked;
  const showHoverHighlight = hasGerman && hovered && !blocked;
  const showButtons = hasGerman && hovered && !blocked;

  return (
    <div className="mb-0.5 last:mb-0">
      {/* Speaker prefix (not highlighted, no hover) */}
      {speakerPrefix && <span>{speakerPrefix}</span>}
      {/* Primary text (German sentence) — hover & highlight only this span */}
      <span
        ref={primaryRef}
        className="rounded transition-colors"
        style={{
          paddingLeft: 2,
          paddingRight: 2,
          backgroundColor: showHoverHighlight ? "rgba(250, 204, 21, 0.35)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
          setHovered(true);
          const rect = primaryRef.current?.getBoundingClientRect();
          setPopupPos({ x: e.clientX, y: rect?.top ?? e.clientY });
        }}
        onMouseLeave={() => {
          // Delay hide so mouse can reach the popup
          hoverHideTimer.current = setTimeout(() => {
            setHovered(false);
            setPopupPos(null);
            if (ctx?.hoverBlocked) ctx.clearHoverBlock();
          }, 200);
        }}
      >
        {highlightNodes}
      </span>

      {/* Hover popup — positioned like PDF: above mouse, clamped to viewport */}
      {showButtons && popupPos && (
        <div
          className="fixed z-50 flex items-center gap-0.5 bg-white border border-gray-100 rounded-lg shadow-sm px-1.5 py-0.5"
          style={{
            left: Math.min(popupPos.x - 4, window.innerWidth - 120),
            top: popupPos.y - 4,
            transform: "translateY(-100%)",
          }}
          onMouseEnter={() => {
            if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
            setHovered(true);
          }}
          onMouseLeave={() => {
            hoverHideTimer.current = setTimeout(() => {
              setHovered(false);
              setPopupPos(null);
              if (ctx?.hoverBlocked) ctx.clearHoverBlock();
            }, 200);
          }}
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
              <span className="text-[9px] font-medium text-green-600">
                복사됨
              </span>
            ) : (
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
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
                d="M11 19H6a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v6"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l3 3m0 0l3-3m-3 3v-6"
              />
            </svg>
          </button>

          {/* Pronunciation practice */}
          <button
            onClick={() => ctx?.onPractice(getText())}
            title="발음 연습"
            className="p-0.5 rounded text-gray-400 hover:text-purple-600 transition-colors"
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
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Korean annotation tail (e.g., "(존댓말)" after German) */}
      {hasKoreanTail && (
        <span className="text-gray-500">{koreanSplit.rest}</span>
      )}
      {/* Arrow-split translation (→ Korean) */}
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
  p: ({ node: _node, ...props }) => (
    <ParagraphRenderer>{props.children}</ParagraphRenderer>
  ),
  // Tight lists render inline content directly in <li> (no <p> wrapper).
  // Loose lists wrap content in <p> which is already handled above.
  // Only apply LineWithActions when children do NOT already contain ParagraphRenderer.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  li: ({ node: _node, ...props }) => {
    const kids = Children.toArray(props.children);
    const hasBlock = kids.some(
      (c) => isValidElement(c) && c.type === ParagraphRenderer,
    );
    return (
      <li>
        {hasBlock ? (
          props.children
        ) : (
          <LineWithActions>{props.children}</LineWithActions>
        )}
      </li>
    );
  },
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
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
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
function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "오늘";
  if (sameDay(date, yesterday)) return "어제";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save summary button — shown below isSummary assistant messages
// ---------------------------------------------------------------------------
function SaveSummaryButton({
  content,
  onSave,
}: {
  content: string;
  onSave?: (c: string) => void;
}) {
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          저장됨
        </>
      ) : (
        <>
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
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          요약 저장
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FeedbackButtons — thumbs up/down shown below assistant messages
// ---------------------------------------------------------------------------
function FeedbackButtons({
  messageId,
  feedback,
  onFeedback,
}: {
  messageId: string;
  feedback?: "up" | "down" | null;
  onFeedback: (id: string, f: "up" | "down" | null) => void;
}) {
  const toggle = (val: "up" | "down") =>
    onFeedback(messageId, feedback === val ? null : val);

  return (
    <div className="flex items-center gap-1 mt-1.5">
      <button
        onClick={() => toggle("up")}
        title="도움이 됐어요"
        className={`p-1 rounded transition-colors ${
          feedback === "up"
            ? "text-blue-600"
            : "text-gray-300 hover:text-blue-400"
        }`}
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill={feedback === "up" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
          />
        </svg>
      </button>
      <button
        onClick={() => toggle("down")}
        title="도움이 안 됐어요"
        className={`p-1 rounded transition-colors ${
          feedback === "down"
            ? "text-red-500"
            : "text-gray-300 hover:text-red-400"
        }`}
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill={feedback === "down" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
          />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------
interface MessageListProps {
  messages: Message[];
  speak: (text: string) => void;
  onInject: (text: string) => void;
  onPractice: (text: string) => void;
  onSaveSummary?: (content: string) => void;
  onFeedback?: (messageId: string, feedback: "up" | "down" | null) => void;
}

export default function MessageList({
  messages,
  speak,
  onInject,
  onPractice,
  onSaveSummary,
  onFeedback,
}: MessageListProps) {
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [hoverBlocked, setHoverBlocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  let lastDateKey = "";

  const blockHoverRef = useRef(() => setHoverBlocked(true));
  blockHoverRef.current = () => setHoverBlocked(true);

  const clearHoverBlock = () => setHoverBlocked(false);

  // Wrap setSelectionPopup to block hover until mouse leaves the line
  const handleSetSelectionPopup = (
    p: { x: number; y: number; text: string } | null,
  ) => {
    setSelectionPopup(p);
    if (p === null) setHoverBlocked(true);
  };

  // Selection detection: drag / dblclick → show floating popup
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const showPopup = (mx: number, my: number) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text || !/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(text)) return;
      try {
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;
        // Position above mouse cursor (like PDF)
        setSelectionPopup({ x: mx, y: my, text });
      } catch {
        /* ignore */
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const popup = document.getElementById("chat-sel-popup");
      if (popup?.contains(e.target as Node)) return;
      setTimeout(() => showPopup(e.clientX, e.clientY), 10);
    };

    const handleDblClick = (e: MouseEvent) => {
      setTimeout(() => showPopup(e.clientX, e.clientY), 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const popup = document.getElementById("chat-sel-popup");
      if (popup?.contains(e.target as Node)) return;
      // Use setState updater to check if popup was open before clearing
      setSelectionPopup((prev) => {
        if (prev !== null) blockHoverRef.current();
        return null;
      });
    };

    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("dblclick", handleDblClick);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("dblclick", handleDblClick);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  return (
    <ChatActionsCtx.Provider
      value={{
        speak,
        onInject,
        onPractice,
        selectionPopup,
        setSelectionPopup: handleSetSelectionPopup,
        hoverBlocked,
        clearHoverBlock,
      }}
    >
      {/* Selection popup — same style as hover action buttons */}
      {selectionPopup && (
        <div
          id="chat-sel-popup"
          className="fixed z-50 flex items-center gap-0.5 bg-white border border-gray-100 rounded-lg shadow-sm px-1.5 py-0.5"
          style={{
            left: selectionPopup.x,
            top: selectionPopup.y - 8,
            transform: "translateX(-50%) translateY(-100%)",
          }}
        >
          {/* TTS */}
          <button
            onClick={() => {
              speak(selectionPopup.text);
              handleSetSelectionPopup(null);
            }}
            title="발음 듣기"
            className="p-0.5 rounded text-gray-400 hover:text-blue-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          </button>
          {/* Inject to input (질문하기) */}
          <button
            onClick={() => {
              onInject(selectionPopup.text);
              handleSetSelectionPopup(null);
            }}
            title="입력창에 사용"
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
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
                d="M11 19H6a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v6"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l3 3m0 0l3-3m-3 3v-6"
              />
            </svg>
          </button>
        </div>
      )}
      <div ref={listRef} className="chat-messages space-y-4">
        {messages.map((msg) => {
          let separator: React.ReactNode = null;
          if (msg.createdAt) {
            const dateKey = toDateKey(msg.createdAt);
            if (dateKey !== lastDateKey) {
              separator = (
                <DateSeparator
                  key={`sep-${dateKey}`}
                  label={formatDateLabel(msg.createdAt)}
                />
              );
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
                      대화 요약 요청
                    </div>
                  ) : (
                    <div className="relative group max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-blue-600 text-white rounded-br-sm">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {!msg.isStreaming && msg.content && (
                        <CopyButton text={msg.content} />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start">
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed rounded-bl-sm shadow-sm ${
                      msg.isSummary
                        ? "bg-blue-50 border border-blue-200 text-gray-800"
                        : "bg-white border border-gray-200 text-gray-800"
                    }`}
                  >
                    <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-strong:text-gray-900">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                      )}
                      {msg.isTruncated && !msg.isStreaming && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠ 응답이 길어져 일부 잘렸습니다. 더 구체적으로 나눠서
                          질문해 보세요.
                        </p>
                      )}
                    </div>
                    {msg.isSummary && !msg.isStreaming && (
                      <SaveSummaryButton
                        content={msg.content}
                        onSave={onSaveSummary}
                      />
                    )}
                  </div>
                  {!msg.isStreaming &&
                    !msg.isSummary &&
                    msg.backendId &&
                    onFeedback && (
                      <FeedbackButtons
                        messageId={msg.backendId}
                        feedback={msg.feedback}
                        onFeedback={onFeedback}
                      />
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChatActionsCtx.Provider>
  );
}
