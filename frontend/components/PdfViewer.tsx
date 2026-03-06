"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PronunciationModal from "./PronunciationModal";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  savePdfToLibrary,
  loadPdfFromLibrary,
  deletePdfFromLibrary,
  getLibraryMeta,
  upsertLibraryMeta,
  removeLibraryMeta,
  LIBRARY_CURRENT_KEY,
  type PdfMeta,
} from "@/lib/pdfLibrary";

export type { PdfMeta };

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastOpened(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// TOC helpers
// ---------------------------------------------------------------------------
interface TocItem {
  title: string;
  page: number;
  level: number;
}

async function flattenOutline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  level: number,
): Promise<TocItem[]> {
  const result: TocItem[] = [];
  for (const item of items) {
    let page: number | null = null;
    try {
      if (Array.isArray(item.dest) && item.dest[0]) {
        page = (await pdf.getPageIndex(item.dest[0])) + 1;
      } else if (typeof item.dest === "string") {
        const dest = await pdf.getDestination(item.dest);
        if (dest?.[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
      }
    } catch {
      /* skip unresolvable dest */
    }
    if (page !== null) result.push({ title: item.title ?? "", page, level });
    if (item.items?.length) {
      result.push(...(await flattenOutline(pdf, item.items, level + 1)));
    }
  }
  return result;
}

// Auto-generate TOC from text content when PDF has no built-in outline.
// Identifies headings by font size: items with fontSize > median * 1.4 are candidates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateTocFromContent(
  pdf: any,
  numPages: number,
): Promise<TocItem[]> {
  interface Raw {
    str: string;
    fontSize: number;
    page: number;
    y: number;
  }
  const all: Raw[] = [];

  for (let p = 1; p <= numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of content.items as any[]) {
        const str = (item.str ?? "").trim();
        if (!str) continue;
        const t = item.transform as number[];
        const sz = Math.abs(t?.[3] ?? 0);
        if (sz > 0) all.push({ str, fontSize: sz, page: p, y: t?.[5] ?? 0 });
      }
    } catch {
      /* skip unreadable page */
    }
  }

  if (all.length < 5) return [];

  const sorted = [...all.map((i) => i.fontSize)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return [];

  const thresh = median * 1.4;
  const cands = all.filter(
    (i) =>
      i.fontSize > thresh &&
      i.str.length >= 2 &&
      i.str.length <= 100 &&
      !/^\d+$/.test(i.str),
  );
  if (!cands.length) return [];

  // Merge consecutive items on the same page + same line (y within 3 units) → one heading
  const lines: { str: string; fontSize: number; page: number; y: number }[] =
    [];
  for (const c of cands) {
    const last = lines[lines.length - 1];
    if (last && last.page === c.page && Math.abs(last.y - c.y) <= 3) {
      last.str += " " + c.str;
    } else {
      lines.push({ str: c.str, fontSize: c.fontSize, page: c.page, y: c.y });
    }
  }

  // Map top-3 distinct font sizes → heading levels 0, 1, 2
  const distinctSizes = [
    ...new Set(lines.map((l) => Math.round(l.fontSize * 2) / 2)),
  ]
    .sort((a, b) => b - a)
    .slice(0, 3);
  const getLevel = (sz: number) => {
    const r = Math.round(sz * 2) / 2;
    const idx = distinctSizes.findIndex((s) => s === r);
    return idx < 0 ? 0 : idx;
  };

  const seen = new Set<string>();
  return lines
    .filter((l) => {
      const key = `${l.page}:${l.str}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((l) => ({ title: l.str, page: l.page, level: getLevel(l.fontSize) }));
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------
interface SearchResult {
  page: number;
  excerpt: string;
}

function ExcerptHighlight({ text, query }: { text: string; query: string }) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface SelectionPopup {
  x: number;
  y: number;
  text: string;
}
interface HoverPopup {
  x: number;
  y: number;
  text: string;
}

interface PdfViewerProps {
  onTextSelect: (payload: { text: string; id: number }) => void;
  onPageImageChange: (base64: string | null) => void;
  speak: (text: string) => void;
  openFile?: File | null;   // external file to open (set by parent modal)
  onClose?: () => void;     // called when the viewer's close button is clicked
}

export default function PdfViewer({
  onTextSelect,
  onPageImageChange,
  speak,
  openFile,
  onClose,
}: PdfViewerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [popup, setPopup] = useState<SelectionPopup | null>(null);
  const [hoverPopup, setHoverPopup] = useState<HoverPopup | null>(null);
  const [practicePdfText, setPracticePdfText] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [library, setLibrary] = useState<PdfMeta[]>([]);
  const [pageInputStr, setPageInputStr] = useState<string | null>(null);

  // TOC state
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocIsGenerated, setTocIsGenerated] = useState(false); // true = auto-generated (no built-in outline)
  const [showToc, setShowToc] = useState(false);
  const tocLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const hoverShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupActiveRef = useRef(false);
  // After selection popup dismisses, block hover until mouse moves ≥ HOVER_BLOCK_DIST px
  const hoverBlockOriginRef = useRef<{ x: number; y: number } | null>(null);
  const HOVER_BLOCK_DIST = 50;

  // Open file passed from parent (modal selection)
  useEffect(() => {
    if (openFile) handleFileChange(openFile);
  }, [openFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore library metadata + last-opened PDF on mount
  useEffect(() => {
    setLibrary(getLibraryMeta());
    const currentName = localStorage.getItem(LIBRARY_CURRENT_KEY);
    if (!currentName) { setIsRestoring(false); return; }
    loadPdfFromLibrary(currentName).then((saved) => {
      if (saved) setFile(saved);
      setIsRestoring(false);
    });
  }, []);

  // Restore last-viewed page when file changes
  useEffect(() => {
    if (!file) return;
    const saved = parseInt(
      localStorage.getItem(`lingua-pdf-page:${file.name}`) ?? "1",
    );
    setPageNumber(!isNaN(saved) && saved >= 1 ? saved : 1);
  }, [file?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist page number
  useEffect(() => {
    if (!file) return;
    localStorage.setItem(`lingua-pdf-page:${file.name}`, String(pageNumber));
  }, [file?.name, pageNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Cmd+F / Ctrl+F → open search; Escape → close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && file) {
        e.preventDefault();
        if (searchLeaveTimerRef.current)
          clearTimeout(searchLeaveTimerRef.current);
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (e.key === "Escape") {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [file]);

  // Focus search input when panel opens
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSearch]);

  // Debounced full-text search across all pages
  useEffect(() => {
    if (!searchQuery.trim() || !pdfDocRef.current || numPages === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      const results: SearchResult[] = [];
      const lowerQuery = searchQuery.trim().toLowerCase();

      for (let p = 1; p <= numPages; p++) {
        if (cancelled) break;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const page = await pdfDocRef.current.getPage(p);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content = await page.getTextContent();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (content.items as Array<{ str?: string }>)
            .map((item) => item.str ?? "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const lowerText = text.toLowerCase();
          const idx = lowerText.indexOf(lowerQuery);
          if (idx !== -1) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(text.length, idx + lowerQuery.length + 30);
            const excerpt =
              (start > 0 ? "…" : "") +
              text.slice(start, end) +
              (end < text.length ? "…" : "");
            results.push({ page: p, excerpt });
          }
        } catch {
          /* skip unreadable page */
        }
      }

      if (!cancelled) {
        setSearchResults(results);
        setIsSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, numPages]);

  // Keep popupActiveRef in sync so the hover effect closure sees current value.
  // When selection popup opens: cancel any pending hover show timer + clear hover state.
  useEffect(() => {
    popupActiveRef.current = popup !== null;
    if (popup !== null) {
      if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current);
      setHoverPopup(null);
    }
  }, [popup]);

  // Extract the sentence containing the hovered span from the PDF text layer.
  // Walks neighboring spans in reading order, using Korean/CJK chars, pure
  // symbol/number spans, and sentence-ending punctuation as natural boundaries.
  const extractSentenceText = useCallback((targetEl: Element): string => {
    const textLayer = containerRef.current?.querySelector(
      ".react-pdf__Page__textContent",
    );
    if (!textLayer) return (targetEl.textContent ?? "").trim();

    const rawText = (targetEl.textContent ?? "").trim();

    const isKoreanOrCJK = (t: string) =>
      /[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]/.test(t);
    const hasAlpha = (t: string) =>
      /[a-zA-ZÀ-ÖØ-öø-ÿ\u1100-\uD7FF]/.test(t);
    const endsPunct = (t: string) => /[.!?]\s*$/.test(t);
    const isPureNonAlpha = (t: string) => !hasAlpha(t); // numbers, bullets…

    // Skip spans with no alphabetic content (page numbers, bullet dots, etc.)
    if (!hasAlpha(rawText)) return "";

    const hasLatin = (t: string) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(t);

    // For Korean/CJK-only spans: return raw text
    // For mixed German+Korean spans: strip Korean portion so popup shows only German
    if (isKoreanOrCJK(rawText)) {
      if (!hasLatin(rawText)) return rawText;
      return rawText
        .replace(/[\u1100-\uD7FF\u4E00-\u9FFF\u3040-\u30FF]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Collect all visible spans sorted by reading order (top→bottom, left→right)
    const allSpans = Array.from(textLayer.querySelectorAll("span")).filter(
      (s) => {
        const r = s.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      },
    );
    allSpans.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const dy = ra.top - rb.top;
      if (Math.abs(dy) > 3) return dy;
      return ra.left - rb.left;
    });

    const hoveredIdx = allSpans.indexOf(targetEl as HTMLElement);
    if (hoveredIdx === -1) return rawText;

    // Walk backward: stop at Korean/CJK, pure-symbol, or span ending with .!?
    let sentStartIdx = hoveredIdx;
    for (let i = hoveredIdx - 1; i >= Math.max(0, hoveredIdx - 40); i--) {
      const t = (allSpans[i].textContent ?? "").trim();
      if (isKoreanOrCJK(t) || isPureNonAlpha(t) || endsPunct(t)) break;
      sentStartIdx = i;
    }

    // Walk forward: stop at Korean/CJK, pure-symbol, or after span ending with .!?
    // Skip if the hovered span itself already ends with punctuation.
    let sentEndIdx = hoveredIdx;
    if (!endsPunct(rawText)) {
      for (
        let i = hoveredIdx + 1;
        i < Math.min(allSpans.length, hoveredIdx + 40);
        i++
      ) {
        const t = (allSpans[i].textContent ?? "").trim();
        if (isKoreanOrCJK(t) || isPureNonAlpha(t)) break;
        sentEndIdx = i;
        if (endsPunct(t)) break;
      }
    }

    const parts: string[] = [];
    for (let i = sentStartIdx; i <= sentEndIdx; i++) {
      parts.push((allSpans[i].textContent ?? "").trim());
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, []);

  // Hover detection on the PDF container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clearShow = () => {
      if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current);
    };
    const clearHide = () => {
      if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Hover blocked after selection popup dismisses — wait until mouse moves far enough
      if (hoverBlockOriginRef.current) {
        const dx = e.clientX - hoverBlockOriginRef.current.x;
        const dy = e.clientY - hoverBlockOriginRef.current.y;
        if (dx * dx + dy * dy < HOVER_BLOCK_DIST * HOVER_BLOCK_DIST) {
          clearShow();
          return;
        }
        hoverBlockOriginRef.current = null;
      }
      if (popupActiveRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      // If cursor is over the hover popup itself, cancel show timer only.
      // Do NOT cancel the hide timer — mouseleave-triggered hides must still fire.
      // onMouseEnter on the popup itself handles cancelling hide when cursor is there.
      const hoverPopupEl = document.getElementById("pdf-hover-popup");
      if (hoverPopupEl && el && hoverPopupEl.contains(el)) {
        clearShow();
        return;
      }
      const textLayer = container.querySelector(
        ".react-pdf__Page__textContent",
      );
      if (!textLayer) return;
      if (!el || !textLayer.contains(el)) {
        clearShow();
        clearHide();
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 200);
        return;
      }
      // Only trigger on leaf text elements (no child elements, has text content)
      if (el.childElementCount > 0 || !(el.textContent ?? "").trim()) {
        clearShow();
        clearHide();
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 200);
        return;
      }
      // Only trigger if span contains a Latin letter.
      // Previously required starting with a letter, which blocked spans like
      // "Ⓐ Aus welchem Land kommst du?" where Ⓐ (U+24B6) is not in the ASCII range.
      const spanText = (el.textContent ?? "").trim();
      const hasLatinLetter = /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(spanText);
      if (!hasLatinLetter) {
        clearShow();
        clearHide();
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 200);
        return;
      }
      clearHide();
      clearShow();
      hoverShowTimer.current = setTimeout(() => {
        if (popupActiveRef.current) return;
        const text = extractSentenceText(el);
        if (text && /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(text))
          setHoverPopup({ x: e.clientX, y: e.clientY, text });
      }, 400);
    };

    const handleMouseLeave = () => {
      clearShow();
      clearHide();
      hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 300);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      clearShow();
      clearHide();
    };
  }, [extractSentenceText, file]);

  // caretRangeFromPoint with Firefox fallback
  function getCaretRange(x: number, y: number): Range | null {
    if (typeof document.caretRangeFromPoint === "function") {
      return document.caretRangeFromPoint(x, y);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = (document as any).caretPositionFromPoint?.(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }

  // Precise text selection using caretRangeFromPoint
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const popupEl = document.getElementById("pdf-selection-popup");
      if (popupEl && !popupEl.contains(e.target as Node)) {
        hoverBlockOriginRef.current = { x: e.clientX, y: e.clientY };
        setPopup(null);
      }

      const hoverPopupEl = document.getElementById("pdf-hover-popup");
      if (hoverPopupEl && !hoverPopupEl.contains(e.target as Node)) setHoverPopup(null);

      const textLayer = containerRef.current?.querySelector(
        ".react-pdf__Page__textContent",
      );
      dragStartPoint.current = textLayer?.contains(e.target as Node)
        ? { x: e.clientX, y: e.clientY }
        : null;
    };

    const handleMouseUp = (e: MouseEvent) => {
      setTimeout(() => {
        const textLayer = containerRef.current?.querySelector(
          ".react-pdf__Page__textContent",
        );
        const start = dragStartPoint.current;
        dragStartPoint.current = null;
        if (!textLayer || !start) return;

        const startCaret = getCaretRange(start.x, start.y);
        const endCaret = getCaretRange(e.clientX, e.clientY);
        if (!startCaret || !endCaret) {
          setPopup(null);
          return;
        }

        if (
          !textLayer.contains(startCaret.startContainer) ||
          !textLayer.contains(endCaret.startContainer)
        ) {
          setPopup(null);
          return;
        }

        try {
          const cmp = startCaret.compareBoundaryPoints(
            Range.START_TO_START,
            endCaret,
          );
          const range = document.createRange();
          if (cmp <= 0) {
            range.setStart(startCaret.startContainer, startCaret.startOffset);
            range.setEnd(endCaret.startContainer, endCaret.startOffset);
          } else {
            range.setStart(endCaret.startContainer, endCaret.startOffset);
            range.setEnd(startCaret.startContainer, startCaret.startOffset);
          }
          const text = range.toString().trim();
          if (!text) {
            setPopup(null);
            window.getSelection()?.removeAllRanges();
            return;
          }

          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          setPopup({ x: e.clientX, y: e.clientY, text });
        } catch {
          setPopup(null);
        }
      }, 10);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleFileChange = useCallback(
    (f: File) => {
      if (f.type !== "application/pdf") return;
      setFile(f);
      setNumPages(0);
      setPopup(null);
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
      setToc([]);
      setTocIsGenerated(false);
      setShowToc(false);
      pdfDocRef.current = null;
      onPageImageChange(null);
      const updated = upsertLibraryMeta(f);
      setLibrary(updated);
      localStorage.setItem(LIBRARY_CURRENT_KEY, f.name);
      savePdfToLibrary(f).catch(() => { /* ignore IDB errors */ });
    },
    [onPageImageChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileChange(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange(f);
  };

  const closeFile = () => {
    setFile(null);
    setPopup(null);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setToc([]);
    setTocIsGenerated(false);
    setShowToc(false);
    pdfDocRef.current = null;
    onPageImageChange(null);
    localStorage.removeItem(LIBRARY_CURRENT_KEY);
    onClose?.();
  };

  const handleLoadFromLibrary = useCallback(async (name: string) => {
    const f = await loadPdfFromLibrary(name);
    if (!f) {
      // IDB entry gone — remove stale meta
      setLibrary(removeLibraryMeta(name));
      return;
    }
    setFile(f);
    setNumPages(0);
    setPopup(null);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setToc([]);
    setTocIsGenerated(false);
    setShowToc(false);
    pdfDocRef.current = null;
    onPageImageChange(null);
    const updated = upsertLibraryMeta(f);
    setLibrary(updated);
    localStorage.setItem(LIBRARY_CURRENT_KEY, name);
  }, [onPageImageChange]);

  const handleDeleteFromLibrary = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deletePdfFromLibrary(name);
    setLibrary(removeLibraryMeta(name));
    if (file?.name === name) {
      setFile(null);
      setPopup(null);
      setToc([]);
      setTocIsGenerated(false);
      pdfDocRef.current = null;
      onPageImageChange(null);
      localStorage.removeItem(LIBRARY_CURRENT_KEY);
    }
  }, [file?.name, onPageImageChange]);

  // Empty state
  if (isRestoring) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <span className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!file) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${
          isDraggingOver ? "bg-blue-50" : "bg-gray-50"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
      >
        <div
          className={`flex flex-col items-center gap-4 border-2 border-dashed rounded-2xl px-10 py-12 transition-colors ${
            isDraggingOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-white"
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              PDF 파일을 여기에 놓거나
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              파일을 선택해서 불러오세요
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            파일 선택
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
        <p className="text-xs text-gray-400 mt-4">
          업로드 없이 브라우저에서만 사용됩니다
        </p>

        {/* Recent files list */}
        {library.length > 0 && (
          <div className="mt-6 w-full max-w-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">최근 파일</p>
            <div className="space-y-1.5">
              {library.map((entry) => (
                <div
                  key={entry.name}
                  onClick={() => handleLoadFromLibrary(entry.name)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer group transition-colors"
                >
                  {/* PDF icon */}
                  <svg className="w-8 h-8 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" opacity={0.3} />
                    <path d="M14 2v6h6M9 13h6M9 17h4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                    <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatFileSize(entry.size)} · {formatLastOpened(entry.lastOpened)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteFromLibrary(entry.name, e)}
                    title="목록에서 삭제"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-gray-100"
      ref={containerRef}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <span
          className="text-sm text-gray-600 truncate flex-1 min-w-0"
          title={file.name}
        >
          {file.name}
        </span>

        {/* TOC button — only shown when PDF has an outline */}
        {toc.length > 0 && (
          <div
            className="relative shrink-0"
            onMouseEnter={() => {
              if (tocLeaveTimerRef.current)
                clearTimeout(tocLeaveTimerRef.current);
              setShowToc(true);
            }}
            onMouseLeave={() => {
              tocLeaveTimerRef.current = setTimeout(
                () => setShowToc(false),
                150,
              );
            }}
          >
            <button
              title="목차"
              className={`p-1.5 rounded-lg transition-colors ${
                showToc
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
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
                  d="M4 6h16M4 10h16M4 14h10M4 18h10"
                />
              </svg>
            </button>

            {showToc && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-64 max-h-80 overflow-y-auto">
                {tocIsGenerated && (
                  <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-600 font-medium">
                      자동 생성됨
                    </span>
                    <span className="text-[10px] text-gray-400">
                      · 폰트 크기 기반
                    </span>
                  </div>
                )}
                <div className="p-1">
                  {toc.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPageNumber(item.page);
                        setShowToc(false);
                      }}
                      style={{ paddingLeft: `${8 + item.level * 12}px` }}
                      className="w-full text-left py-1.5 pr-2.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 group"
                    >
                      <span className="text-xs text-gray-700 group-hover:text-gray-900 truncate">
                        {item.title}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                        {item.page}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search toggle button */}
        <div
          className="relative shrink-0"
          onMouseEnter={() => {
            if (searchLeaveTimerRef.current)
              clearTimeout(searchLeaveTimerRef.current);
            setShowSearch(true);
          }}
          onMouseLeave={() => {
            searchLeaveTimerRef.current = setTimeout(
              () => setShowSearch(false),
              150,
            );
          }}
        >
          <button
            title="내용 찾기 (⌘F)"
            className={`p-1.5 rounded-lg transition-colors ${
              showSearch
                ? "bg-blue-100 text-blue-600"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35"
              />
            </svg>
          </button>

          {showSearch && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-80 p-3">
              {/* Input row */}
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35"
                    />
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowSearch(false);
                        setSearchQuery("");
                        setSearchResults([]);
                      }
                    }}
                    placeholder="페이지 내용 검색..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                  title="닫기 (Esc)"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Results */}
              {isSearching && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                  <span className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                  전체 페이지 검색 중...
                </div>
              )}

              {!isSearching && searchQuery.trim() && (
                <div className="max-h-44 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1">결과 없음</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 mb-1.5">
                        {searchResults.length}개 페이지 발견
                      </p>
                      <div className="space-y-1">
                        {searchResults.map((r) => (
                          <button
                            key={r.page}
                            onClick={() => {
                              setPageNumber(r.page);
                              setShowSearch(false);
                              setSearchQuery("");
                              setSearchResults([]);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50 transition-colors flex items-start gap-2.5 group"
                          >
                            <span className="text-xs font-semibold text-blue-600 shrink-0 mt-0.5 tabular-nums">
                              p.{r.page}
                            </span>
                            <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 line-clamp-2">
                              <ExcerptHighlight
                                text={r.excerpt}
                                query={searchQuery.trim()}
                              />
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={closeFile}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          title="다른 파일 열기"
        >
          닫기
        </button>
      </div>

      {/* Page area */}
      <div className="flex-1 overflow-y-auto flex justify-center px-4 py-4">
        <Document
          file={file}
          onLoadSuccess={async (pdf) => {
            setNumPages(pdf.numPages);
            pdfDocRef.current = pdf;
            setToc([]);
            setTocIsGenerated(false);
            try {
              const outline = await pdf.getOutline();
              if (outline?.length) {
                const resolved = await flattenOutline(pdf, outline, 0);
                setToc(resolved);
                setTocIsGenerated(false);
              } else {
                // No built-in outline → auto-generate from font-size heuristic
                const generated = await generateTocFromContent(
                  pdf,
                  pdf.numPages,
                );
                setToc(generated);
                setTocIsGenerated(true);
              }
            } catch {
              /* PDF has no outline */
            }
          }}
          loading={
            <div className="flex items-center gap-2 text-gray-400 text-sm mt-16">
              <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              PDF 불러오는 중...
            </div>
          }
          error={
            <div className="text-red-500 text-sm mt-16">
              PDF를 불러올 수 없습니다.
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            className="shadow-md"
            width={Math.min(
              (containerRef.current?.clientWidth ?? 600) - 32,
              760,
            )}
            onRenderSuccess={() => {
              const canvas = containerRef.current?.querySelector(
                "canvas",
              ) as HTMLCanvasElement | null;
              if (!canvas) return;
              try {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                onPageImageChange(
                  dataUrl.replace("data:image/jpeg;base64,", ""),
                );
              } catch {
                onPageImageChange(null);
              }
            }}
          />
        </Document>
      </div>

      {/* Page navigation */}
      {numPages > 0 && (
        <div className="flex items-center justify-center gap-3 py-2 bg-white border-t border-gray-200 shrink-0">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="이전 페이지"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <span className="flex items-center gap-1 text-sm text-gray-600 tabular-nums">
            {pageInputStr === null ? (
              <button
                onClick={() => setPageInputStr(String(pageNumber))}
                title="클릭하여 페이지 입력"
                className="min-w-[2rem] text-center px-1 py-0.5 rounded hover:bg-gray-100 transition-colors"
              >
                {pageNumber}
              </button>
            ) : (
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={pageInputStr}
                onChange={(e) => setPageInputStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(pageInputStr, 10);
                    if (!isNaN(n) && n >= 1 && n <= numPages) setPageNumber(n);
                    setPageInputStr(null);
                  } else if (e.key === "Escape") {
                    setPageInputStr(null);
                  }
                }}
                onBlur={() => {
                  const n = parseInt(pageInputStr, 10);
                  if (!isNaN(n) && n >= 1 && n <= numPages) setPageNumber(n);
                  setPageInputStr(null);
                }}
                className="w-10 text-center px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
            <span>/ {numPages}</span>
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="다음 페이지"
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Hover popup */}
      {hoverPopup && !popup && (
        <div
          id="pdf-hover-popup"
          className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden flex"
          style={{
            left: Math.min(hoverPopup.x - 4, window.innerWidth - 220),
            top: hoverPopup.y - 52 < 8
              ? hoverPopup.y + 20
              : hoverPopup.y - 52,
          }}
          onMouseEnter={() => {
            if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
          }}
          onMouseLeave={() => {
            hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 200);
          }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => speak(hoverPopup.text)}
            className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
            title="소리 내어 읽기"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            소리
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(hoverPopup.text);
              setHoverPopup(null);
            }}
            className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
            title="클립보드에 복사"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
              />
            </svg>
            복사
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onTextSelect({ text: hoverPopup.text, id: Date.now() });
              setHoverPopup(null);
            }}
            className="px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-200 active:scale-95 transition-all flex items-center gap-1.5"
            title="질문하기"
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
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
            질문하기
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setPracticePdfText(hoverPopup.text);
              setHoverPopup(null);
            }}
            className="px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 active:bg-purple-200 active:scale-95 transition-all flex items-center gap-1.5"
            title="발음 연습"
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
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            연습
          </button>
        </div>
      )}

      {/* Selection popup */}
      {popup && (
        <div
          id="pdf-selection-popup"
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden flex"
          style={{
            left: Math.min(popup.x - 4, window.innerWidth - 200),
            top: popup.y - 48,
          }}
          onMouseLeave={(e) => {
            hoverBlockOriginRef.current = { x: e.clientX, y: e.clientY };
            setPopup(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => speak(popup.text)}
            className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            소리
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              hoverBlockOriginRef.current = { x: e.clientX, y: e.clientY };
              onTextSelect({ text: popup.text, id: Date.now() });
              setPopup(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-200 active:scale-95 transition-all flex items-center gap-1.5"
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
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3z"
              />
            </svg>
            질문하기
          </button>
        </div>
      )}

      {/* Pronunciation practice modal */}
      {practicePdfText && (
        <PronunciationModal
          key={practicePdfText}
          text={practicePdfText}
          speak={speak}
          onClose={() => setPracticePdfText(null)}
        />
      )}
    </div>
  );
}
