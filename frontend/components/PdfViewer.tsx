"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import PronunciationModal from "./PronunciationModal";
import { TTS_LANGUAGES } from "@/hooks/useTTS";
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
  setLibraryMetaServerId,
  LIBRARY_CURRENT_KEY,
  type PdfMeta,
} from "@/lib/pdfLibrary";
import {
  fetchAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  type Annotation,
} from "@/lib/annotations";

export type { PdfMeta };

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const GERMAN_ABBREVS = [
  "z.B",
  "bzw",
  "d.h",
  "ca",
  "Nr",
  "Dr",
  "Prof",
  "Str",
  "Hr",
  "Fr",
  "evtl",
  "ggf",
  "usw",
  "etc",
  "inkl",
  "exkl",
  "max",
  "min",
  "tel",
  "vgl",
  "sog",
  "u.a",
  "o.ä",
  "s.o",
  "s.u",
  "i.d.R",
  "m.E",
  "Mio",
  "Mrd",
  "Abs",
  "Art",
  "Bd",
  "Jh",
  "hl",
  "St",
];

const DOCUMENT_OPTIONS = {
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};

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
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
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

export interface PdfViewerHandle {
  getPageText: () => Promise<string | null>;
  hasFile: () => boolean;
}

interface PdfViewerProps {
  onTextSelect: (payload: { text: string; id: number }) => void;
  onPageChange?: (pageNumber: number) => void;
  speak: (text: string) => void;
  language: string | null;
  onLanguageChange: (lang: string) => void;
  openFile?: File | null; // external file to open (set by parent modal)
  onClose?: () => void; // called when the viewer's close button is clicked
}

function PdfViewerInner(
  { onTextSelect, onPageChange, speak, language, onLanguageChange, openFile, onClose }: PdfViewerProps,
  ref: React.ForwardedRef<PdfViewerHandle>,
) {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [popup, setPopup] = useState<SelectionPopup | null>(null);
  const [popupTranslation, setPopupTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [hoverPopup, setHoverPopup] = useState<HoverPopup | null>(null);
  const [practicePdfText, setPracticePdfText] = useState<string | null>(null);
  const [showLangModal, setShowLangModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [pageInputStr, setPageInputStr] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);

  // Server-side PDF ID (for annotations)
  const [serverId, setServerId] = useState<string | null>(null);

  // Annotation state
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pendingNote, setPendingNote] = useState<{ xPct: number; yPct: number } | null>(null);
  const [editingAnnot, setEditingAnnot] = useState<Annotation | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteColor, setNoteColor] = useState("yellow");

  // TOC state
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocIsGenerated, setTocIsGenerated] = useState(false); // true = auto-generated (no built-in outline)
  const [showToc, setShowToc] = useState(false);
  const tocLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;

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

  // Expose imperative handle for parent to extract page text client-side
  useImperativeHandle(
    ref,
    () => ({
      getPageText: async () => {
        const doc = pdfDocRef.current;
        if (!doc) return null;
        try {
          const page = await doc.getPage(pageNumber);
          const content = await page.getTextContent();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return content.items.map((item: any) => item.str).join(" ");
        } catch {
          return null;
        }
      },
      hasFile: () => !!file,
      getPdfId: () => serverId,
    }),
    [pageNumber, file, serverId],
  );

  // Load annotations when serverId or page changes
  useEffect(() => {
    if (!serverId) { setAnnotations([]); return; }
    fetchAnnotations(serverId, pageNumber)
      .then(setAnnotations)
      .catch(() => setAnnotations([]));
  }, [serverId, pageNumber]);

  // Sentence hover highlight using PDF-native coordinates from getTextContent().
  // The text layer spans are misaligned with the canvas due to font metric
  // approximation in PDF.js. Instead, we use the exact PDF coordinates
  // (same data the canvas uses) and convert them via getViewport() for
  // pixel-perfect overlays that match the canvas rendering.
  const [highlightRects, setHighlightRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  // Separate state for drag/dblclick selection highlights (persists until focus-out)
  const [selectionRects, setSelectionRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  const isDragging = useRef(false);
  // Cache: textContent items + viewport for the current page
  const textContentCache = useRef<{
    page: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    viewport: { scale: number; width: number; height: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawViewport: any;
  } | null>(null);

  // Open file passed from parent (modal selection)
  useEffect(() => {
    if (openFile) handleFileChange(openFile);
  }, [openFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last-opened PDF on mount (+ restore serverId from meta)
  useEffect(() => {
    const currentName = localStorage.getItem(LIBRARY_CURRENT_KEY);
    if (!currentName) {
      setIsRestoring(false);
      return;
    }
    const meta = getLibraryMeta().find((m) => m.name === currentName);
    if (meta?.serverId) setServerId(meta.serverId);
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

  // Helper: clear highlight
  const clearHighlight = useCallback(() => {
    setHighlightRects([]);
  }, []);

  // Load/cache textContent items for the current page.
  // Uses pageNumberRef to always read the current page (avoids stale closures).
  const ensureTextContent = useCallback(async () => {
    const currentPage = pageNumberRef.current;
    if (!pdfDocRef.current) return null;
    if (textContentCache.current?.page === currentPage)
      return textContentCache.current;
    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const containerW = containerRef.current?.clientWidth ?? 600;
      const desiredWidth = Math.min(containerW - 32, 760);
      const defaultVp = page.getViewport({ scale: 1 });
      const scale = desiredWidth / defaultVp.width;
      const viewport = page.getViewport({ scale });
      const content = await page.getTextContent();
      textContentCache.current = {
        page: currentPage,
        items: content.items ?? [],
        viewport: { scale, width: viewport.width, height: viewport.height },
        rawViewport: viewport,
      };
      return textContentCache.current;
    } catch {
      return null;
    }
  }, []);

  // Compute canvas-accurate rects for a text selection range
  const computeRangeRects = useCallback(
    async (
      range: Range,
      textLayerEl: Element,
    ): Promise<
      { left: number; top: number; width: number; height: number }[]
    > => {
      const cache = await ensureTextContent();
      if (!cache) return [];
      const { items, rawViewport: rv } = cache;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tItems = items.filter(
        (it: any) => typeof it.str === "string" && it.str.trim(),
      );
      const pgEl = containerRef.current?.querySelector(".react-pdf__Page");
      const pgTop = pgEl?.getBoundingClientRect().top ?? 0;
      const usedIdx = new Set<number>();
      const stripSym = (s: string) => s.replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ]+/, "");
      const selSpans = Array.from(textLayerEl.querySelectorAll("span")).filter(
        (s) => {
          const r = s.getBoundingClientRect();
          return (r.width > 0 || r.height > 0) && range.intersectsNode(s);
        },
      );
      const rects: {
        left: number;
        top: number;
        width: number;
        height: number;
      }[] = [];
      for (const sp of selSpans) {
        const spText = (sp.textContent ?? "").trim();
        if (!spText) continue;
        const spRelY = sp.getBoundingClientRect().top - pgTop;
        let bIdx = -1,
          bDist = Infinity;
        for (let j = 0; j < tItems.length; j++) {
          if (usedIdx.has(j)) continue;
          const is2 = tItems[j].str.trim();
          if (is2 !== spText && stripSym(is2) !== stripSym(spText)) continue;
          const tr = tItems[j].transform as number[];
          const [, py] = rv.convertToViewportPoint(tr[4], tr[5]);
          if (Math.abs(py - spRelY) < bDist) {
            bDist = Math.abs(py - spRelY);
            bIdx = j;
          }
        }
        if (bIdx === -1) continue;
        usedIdx.add(bIdx);
        const itm = tItems[bIdx];
        const tr = itm.transform as number[];
        const fs = Math.abs(tr[3]);
        const px = tr[4],
          py = tr[5],
          pw = itm.width as number;
        let sf = 0,
          ef = 1;
        const isStart =
          sp === range.startContainer.parentElement ||
          sp.contains(range.startContainer);
        const isEnd =
          sp === range.endContainer.parentElement ||
          sp.contains(range.endContainer);
        if (isStart || isEnd) {
          const ctx = document.createElement("canvas").getContext("2d");
          if (ctx) {
            ctx.font = window.getComputedStyle(sp).font;
            const fw = ctx.measureText(itm.str as string).width;
            if (fw > 0) {
              if (isStart)
                sf =
                  ctx.measureText(
                    (itm.str as string).slice(0, range.startOffset),
                  ).width / fw;
              if (isEnd)
                ef =
                  ctx.measureText((itm.str as string).slice(0, range.endOffset))
                    .width / fw;
            }
          }
        }
        const wpx = px + sf * pw,
          wpw = (ef - sf) * pw;
        const [x1, y1] = rv.convertToViewportPoint(wpx, py);
        const [x2, y2] = rv.convertToViewportPoint(wpx + wpw, py + fs);
        rects.push({
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        });
      }
      return rects;
    },
    [ensureTextContent],
  );

  // Clear sentence highlight whenever hover popup is dismissed
  useEffect(() => {
    if (hoverPopup === null) clearHighlight();
  }, [hoverPopup, clearHighlight]);

  // Extract sentence using PDF-native textContent items directly.
  // Bypasses text layer spans entirely for sentence detection — uses them only
  // for initial hover detection. This ensures stable results regardless of
  // which span the cursor lands on.
  const extractSentence = useCallback(
    async (
      targetEl: Element,
      mouseX: number,
    ): Promise<{
      text: string;
      rects: { left: number; top: number; width: number; height: number }[];
    }> => {
      const rawText = (targetEl.textContent ?? "").trim();
      // Korean: Hangul Jamo + Compatibility Jamo + Syllables. CJK + Japanese Kana.
      // Excludes Enclosed Alphanumerics (Ⓐ U+24B6 etc.) which fell in the old \u1100-\uD7FF range.
      const KOREAN_RE =
        /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF]/;
      const CJK_RE = /[\u4E00-\u9FFF\u3040-\u30FF]/;
      const isKoreanOrCJK = (t: string) => KOREAN_RE.test(t) || CJK_RE.test(t);
      const hasAlpha = (t: string) =>
        /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(t) || KOREAN_RE.test(t);
      const hasLatin = (t: string) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(t);

      if (!hasAlpha(rawText)) return { text: "", rects: [] };
      if (isKoreanOrCJK(rawText)) {
        const text = !hasLatin(rawText)
          ? rawText
          : rawText
              .replace(
                /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u30FF]+/g,
                " ",
              )
              .replace(/\s+/g, " ")
              .trim();
        return { text, rects: [] };
      }

      // --- Load PDF textContent items (cached) ---
      const cache = await ensureTextContent();
      if (!cache) return { text: rawText, rects: [] };
      const { items, rawViewport } = cache;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textItems = items.filter(
        (it: any) => typeof it.str === "string" && it.str.trim(),
      );
      if (textItems.length === 0) return { text: rawText, rects: [] };

      // --- Match hovered span to a textContent item ---
      const pageEl = containerRef.current?.querySelector(".react-pdf__Page");
      const pageTop = pageEl?.getBoundingClientRect().top ?? 0;
      const spanRect = targetEl.getBoundingClientRect();
      const spanRelY = spanRect.top - pageTop;

      // Match span text to textContent item — try exact match first,
      // then fallback to stripped match (removes leading symbols like Ⓐ, ●, etc.)
      const stripLeadingSymbols = (s: string) =>
        s.replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ]+/, "");
      const strippedRaw = stripLeadingSymbols(rawText);
      let hoveredItemIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < textItems.length; i++) {
        const itemStr = textItems[i].str.trim();
        if (itemStr !== rawText && stripLeadingSymbols(itemStr) !== strippedRaw)
          continue;
        const t = textItems[i].transform as number[];
        const [, py] = rawViewport.convertToViewportPoint(t[4], t[5]);
        const dist = Math.abs(py - spanRelY);
        if (dist < bestDist) {
          bestDist = dist;
          hoveredItemIdx = i;
        }
      }
      if (hoveredItemIdx === -1) {
        console.log(
          "[extract] no matching textContent item for:",
          JSON.stringify(rawText),
        );
        return { text: rawText, rects: [] };
      }

      // --- Pass 1: Identify right-column items to exclude ---
      // Group items by line (Y position), then within each line detect horizontal
      // gaps > 50px. Items after the gap are right-column labels (e.g., "richtig oder falsch").
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemPositions = textItems.map((item: any) => {
        const tr = item.transform as number[];
        const [x, y] = rawViewport.convertToViewportPoint(tr[4], tr[5]);
        const [x2] = rawViewport.convertToViewportPoint(
          tr[4] + (item.width as number),
          tr[5],
        );
        return { x, y, x2 };
      });
      const rightColumnItems = new Set<number>();
      const lineGroups = new Map<number, number[]>();
      for (let i = 0; i < textItems.length; i++) {
        if (!textItems[i].str.trim()) continue;
        const yKey = Math.round(itemPositions[i].y / 4) * 4;
        if (!lineGroups.has(yKey)) lineGroups.set(yKey, []);
        lineGroups.get(yKey)!.push(i);
      }
      // Step 1: Detect right-column items via same-line horizontal gaps
      for (const [, indices] of lineGroups) {
        indices.sort((a, b) => itemPositions[a].x - itemPositions[b].x);
        for (let j = 1; j < indices.length; j++) {
          if (
            itemPositions[indices[j]].x - itemPositions[indices[j - 1]].x2 >
            50
          ) {
            for (let k = j; k < indices.length; k++)
              rightColumnItems.add(indices[k]);
            break;
          }
        }
      }

      // Step 2: Detect isolated right-column lines (e.g., "richtig oder falsch" on its own line)
      // Find the typical left margin from main-column lines
      const mainLineLefts: number[] = [];
      for (const [, indices] of lineGroups) {
        const mainIndices = indices.filter((i) => !rightColumnItems.has(i));
        if (mainIndices.length > 0) {
          mainLineLefts.push(
            Math.min(...mainIndices.map((i) => itemPositions[i].x)),
          );
        }
      }
      if (mainLineLefts.length >= 3) {
        mainLineLefts.sort((a, b) => a - b);
        const refLeftMargin =
          mainLineLefts[Math.floor(mainLineLefts.length / 4)]; // 25th percentile
        for (const [, indices] of lineGroups) {
          // If ALL items on this line start far right of the main left margin → right column
          if (indices.every((i) => itemPositions[i].x > refLeftMargin + 150)) {
            for (const i of indices) rightColumnItems.add(i);
          }
        }
      }

      // DEBUG: log column detection results
      const skippedTexts = [...rightColumnItems].map((i) =>
        textItems[i].str.trim(),
      );
      console.log("[columns]", {
        totalItems: textItems.length,
        rightColumnCount: rightColumnItems.size,
        skippedTexts,
        lineGroupCount: lineGroups.size,
        mainLineLefts: mainLineLefts.slice(0, 5),
      });

      // --- Pass 2: Build concat from the column the hovered item belongs to ---
      // If hovered item is in right column, build concat from right-column items;
      // otherwise build from main-column items. This allows hovering on both columns.
      const hoveredInRightCol = rightColumnItems.has(hoveredItemIdx);
      const itemMap: { itemIdx: number; charStart: number; charEnd: number }[] =
        [];
      let concat = "";
      for (let i = 0; i < textItems.length; i++) {
        const inRightCol = rightColumnItems.has(i);
        if (hoveredInRightCol ? !inRightCol : inRightCol) continue;
        const str = textItems[i].str.trim();
        if (!str) continue;
        // Skip Korean-dominant items to prevent them from contaminating
        // German sentence boundary detection. An item is Korean-dominant
        // if it contains Korean/CJK and Korean chars outnumber Latin chars.
        if (isKoreanOrCJK(str)) {
          const korCount = (
            str.match(
              /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u30FF]/g,
            ) || []
          ).length;
          const latCount = (str.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]/g) || []).length;
          if (korCount > latCount) continue;
        }
        if (concat.length > 0) concat += " ";
        const charStart = concat.length;
        concat += str;
        itemMap.push({ itemIdx: i, charStart, charEnd: concat.length });
      }

      // --- Find hovered position in concatenated text using mouse X ---
      const hoveredEntry = itemMap.find((e) => e.itemIdx === hoveredItemIdx);
      if (!hoveredEntry) return { text: rawText, rects: [] };
      // Use mouse X position relative to the span to pinpoint character position
      const elRect = targetEl.getBoundingClientRect();
      const xFrac =
        elRect.width > 0
          ? Math.max(0, Math.min(1, (mouseX - elRect.left) / elRect.width))
          : 0.5;
      const itemLen = hoveredEntry.charEnd - hoveredEntry.charStart;
      const hoveredCharPos =
        hoveredEntry.charStart + Math.floor(xFrac * itemLen);

      // --- German-aware sentence boundary detection ---
      // Rule: "." + space (or end) = sentence end, UNLESS word before "." is a known abbreviation.
      // This correctly handles "beliebt. richtig" (sentence end) vs "z.B. und" (abbreviation).
      const isSentenceEnd = (pos: number): boolean => {
        const ch = concat[pos];
        if (ch === "!" || ch === "?") return true;
        if (ch !== ".") return false;
        // Ellipsis "..." — not a sentence end
        if (concat[pos + 1] === ".") return false;
        // Must be followed by space or end of text
        if (pos + 1 < concat.length && concat[pos + 1] !== " ") return false;
        // Check word before dot against abbreviation list
        let ws = pos - 1;
        while (ws >= 0 && /[a-zA-ZÀ-ÖØ-öø-ÿ.]/.test(concat[ws])) ws--;
        ws++;
        const word = concat.slice(ws, pos);
        if (GERMAN_ABBREVS.some((a) => a.toLowerCase() === word.toLowerCase()))
          return false;
        // Single uppercase letter + dot = initial (e.g., "A." "B.") — not sentence end
        if (pos - ws === 1 && /[A-ZÀ-ÖØ-Ý]/.test(word)) return false;
        // Number + dot = list item (e.g., "1." "2.") — treat as sentence boundary
        return true;
      };

      // Enclosed alphanumerics (Ⓐ Ⓑ ① ② etc.) act as section/option boundaries
      const isEnclosedAlphanumeric = (ch: string) =>
        ch.charCodeAt(0) >= 0x2460 && ch.charCodeAt(0) <= 0x24ff;

      let sentCharStart = 0;
      for (let i = hoveredCharPos - 1; i >= 0; i--) {
        if (".!?".includes(concat[i]) && isSentenceEnd(i)) {
          sentCharStart = i + 1;
          break;
        }
        if (isEnclosedAlphanumeric(concat[i])) {
          sentCharStart = i;
          break;
        }
      }
      // Skip whitespace and decorative symbols at sentence start
      while (
        sentCharStart < concat.length &&
        /[\s\u2460-\u24FF\u2700-\u27BF●■□▪▫◆◇★☆►▶‣⁃※†‡§¶]/.test(
          concat[sentCharStart],
        )
      )
        sentCharStart++;

      let sentCharEnd = concat.length;
      for (let i = hoveredCharPos; i < concat.length; i++) {
        if (".!?".includes(concat[i]) && isSentenceEnd(i)) {
          sentCharEnd = i + 1;
          break;
        }
        // Stop before the next enclosed alphanumeric (next option/section)
        if (isEnclosedAlphanumeric(concat[i]) && i > hoveredCharPos) {
          sentCharEnd = i;
          break;
        }
      }

      // German sentences always start with an uppercase letter.
      // Skip non-sentence tokens at the start: numbers ("65"), control chars,
      // enclosed alphanumerics, lowercase words ("einsteigen"), heading annotations
      // ("Können(Modalverben)"), and standalone single words ("können").
      while (sentCharStart < sentCharEnd) {
        const ch = concat[sentCharStart];
        if (!ch) break;
        // Skip: non-uppercase chars (digits, lowercase, symbols, control chars)
        if (!/[A-ZÀ-ÖØ-Ý]/.test(ch)) {
          const nextSpace = concat.indexOf(" ", sentCharStart);
          if (nextSpace === -1 || nextSpace >= sentCharEnd) break;
          sentCharStart = nextSpace + 1;
          continue;
        }
        // Check the current token (up to next space)
        const tokenEnd = concat.indexOf(" ", sentCharStart);
        const token =
          tokenEnd === -1 || tokenEnd >= sentCharEnd
            ? concat.slice(sentCharStart, sentCharEnd)
            : concat.slice(sentCharStart, tokenEnd);
        // Skip tokens with parenthetical annotations: "Können(Modalverben)", "Präfix(접두사)"
        if (/\(/.test(token)) {
          if (tokenEnd === -1 || tokenEnd >= sentCharEnd) break;
          sentCharStart = tokenEnd + 1;
          continue;
        }
        // Skip single capitalized words followed by a lowercase word — these are
        // vocabulary labels like "können" preceded by heading "Können"
        // Real sentences have at least 2 words starting from the uppercase token.
        if (tokenEnd !== -1 && tokenEnd < sentCharEnd) {
          const nextCh = concat[tokenEnd + 1];
          if (nextCh && /[a-zà-öø-ÿ]/.test(nextCh)) {
            // The next word is lowercase — this uppercase token + lowercase word
            // might still be a real sentence ("Das ist..."). Only skip if the
            // uppercase token is a single word with no following sentence structure.
            // Heuristic: if the token after this lowercase word starts uppercase,
            // skip both (heading + vocab label pattern).
            const nextTokenEnd = concat.indexOf(" ", tokenEnd + 1);
            if (nextTokenEnd !== -1 && nextTokenEnd < sentCharEnd) {
              const afterNext = concat[nextTokenEnd + 1];
              if (afterNext && /[A-ZÀ-ÖØ-Ý]/.test(afterNext)) {
                // Pattern: "Können können Ihr..." → skip "Können können", keep "Ihr..."
                sentCharStart = nextTokenEnd + 1;
                continue;
              }
            }
          }
        }
        // Uppercase letter, not a heading/label pattern — valid sentence start
        break;
      }

      // Skip heading annotations with parentheses: "Trennbare Verben Präfix(접두사)* + Verb(동사)"
      // Find the last ")" before the hovered position and advance past it if the next
      // substantive token starts with an uppercase letter (= real sentence start).
      {
        let lastParenEnd = -1;
        for (let p = sentCharStart; p < hoveredCharPos; p++) {
          if (concat[p] === ")") lastParenEnd = p;
        }
        if (lastParenEnd > sentCharStart) {
          // Advance past ")" and any trailing non-alpha chars (*, +, spaces)
          let candidate = lastParenEnd + 1;
          while (
            candidate < sentCharEnd &&
            /[\s*+\-□\u001a]/.test(concat[candidate])
          )
            candidate++;
          // Only advance if we land on an uppercase letter (real sentence start)
          if (
            candidate < hoveredCharPos &&
            /[A-ZÀ-ÖØ-Ý]/.test(concat[candidate])
          ) {
            sentCharStart = candidate;
          }
        }
      }

      // Skip dialogue speaker labels (e.g., "Jana :", "Peter:", "Leo :")
      // Search for the LAST "Name :" pattern before the hovered position,
      // so labels preceded by exercise numbering/vocab lists are still caught.
      {
        const NAME_COLON_RE = /\b([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]*)\s*:/g;
        let lastColonEnd = -1;
        let m: RegExpExecArray | null;
        while ((m = NAME_COLON_RE.exec(concat)) !== null) {
          const colonPos = m.index + m[0].length - 1; // position of ":"
          if (colonPos >= sentCharStart && colonPos < hoveredCharPos) {
            lastColonEnd = colonPos + 1;
          }
        }
        if (lastColonEnd > sentCharStart) {
          sentCharStart = lastColonEnd;
          while (sentCharStart < sentCharEnd && concat[sentCharStart] === " ")
            sentCharStart++;
        }
      }

      // If the hovered position fell in a skipped label region (before the real sentence),
      // return empty — the user is hovering on a label, not a sentence.
      if (hoveredCharPos < sentCharStart) return { text: "", rects: [] };

      // Validate that the extracted sentence is a real German sentence, not
      // exercise labels, repeated fragments, or book metadata.
      {
        const sentText = concat.slice(sentCharStart, sentCharEnd).trim();
        const words = sentText.split(/\s+/).filter(Boolean);

        // Too short to be a sentence
        if (words.length < 3) return { text: "", rects: [] };

        // Exercise labels: "b)", "c)", "1)", "2)" etc.
        if (/\b[a-z0-9]\)\s/.test(sentText)) return { text: "", rects: [] };

        // Audio/media markers
        if (/\bMP3\b|\bCD\b|\bTrack\b/i.test(sentText))
          return { text: "", rects: [] };

        // Book title metadata
        if (/Zusammen\s+[A-C][0-9]/i.test(sentText))
          return { text: "", rects: [] };

        // Repetition check: any 2-word sequence appearing 2+ times = fragment list
        const seq2: Record<string, number> = {};
        for (let i = 0; i < words.length - 1; i++) {
          const key = `${words[i].toLowerCase()} ${words[i + 1].toLowerCase()}`;
          seq2[key] = (seq2[key] ?? 0) + 1;
          if (seq2[key] >= 2) return { text: "", rects: [] };
        }
      }

      // DEBUG: log sentence detection
      const contextStart = Math.max(0, sentCharStart - 30);
      const contextEnd = Math.min(concat.length, sentCharEnd + 30);
      console.log("[sentence]", {
        hoveredSpan: rawText,
        hoveredCharPos,
        sentRange: `${sentCharStart}-${sentCharEnd}`,
        sentence: concat.slice(sentCharStart, sentCharEnd),
        contextBefore: concat.slice(contextStart, sentCharStart),
        contextAfter: concat.slice(sentCharEnd, contextEnd),
      });

      // --- Map sentence back to textContent items + compute rects from PDF coords ---
      const overlapping = itemMap.filter(
        (e) => e.charEnd > sentCharStart && e.charStart < sentCharEnd,
      );
      const rects: {
        left: number;
        top: number;
        width: number;
        height: number;
      }[] = [];

      // Find matching text layer spans for measureText font matching
      const textLayerEl = containerRef.current?.querySelector(
        ".react-pdf__Page__textContent",
      );
      const textLayerSpans = textLayerEl
        ? Array.from(textLayerEl.querySelectorAll("span"))
        : [];

      for (let i = 0; i < overlapping.length; i++) {
        const entry = overlapping[i];
        const item = textItems[entry.itemIdx];
        const t = item.transform as number[];
        const fontSize = Math.abs(t[3]);
        const pdfX = t[4];
        const pdfY = t[5];
        const pdfW = item.width as number;
        const itemStr = item.str as string;

        const [x1, y1] = rawViewport.convertToViewportPoint(pdfX, pdfY);
        const [x2, y2] = rawViewport.convertToViewportPoint(
          pdfX + pdfW,
          pdfY + fontSize,
        );
        const fullWidth = Math.abs(x2 - x1);

        // Clip first/last items if sentence boundary is mid-item
        // Use measureText() for accurate sub-string width calculation
        let fracLeft = 0;
        let fracRight = 1;
        const needsClip =
          (i === 0 && sentCharStart > entry.charStart) ||
          (i === overlapping.length - 1 && sentCharEnd < entry.charEnd);

        if (needsClip) {
          // Find matching span for font info
          const itemText = itemStr.trim();
          const stripSym = (s: string) => s.replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ]+/, "");
          const matchSpan = textLayerSpans.find((sp) => {
            const spText = (sp.textContent ?? "").trim();
            return (
              spText === itemText || stripSym(spText) === stripSym(itemText)
            );
          });

          const ctx = document.createElement("canvas").getContext("2d");
          if (ctx && matchSpan) {
            ctx.font = window.getComputedStyle(matchSpan).font;
            const fullW = ctx.measureText(itemStr).width;
            if (fullW > 0) {
              if (i === 0 && sentCharStart > entry.charStart) {
                const clipChars = sentCharStart - entry.charStart;
                fracLeft =
                  ctx.measureText(itemStr.slice(0, clipChars)).width / fullW;
              }
              if (i === overlapping.length - 1 && sentCharEnd < entry.charEnd) {
                const keepChars = sentCharEnd - entry.charStart;
                fracRight =
                  ctx.measureText(itemStr.slice(0, keepChars)).width / fullW;
              }
            }
          } else {
            // Fallback to character-count ratio
            const itemLen = entry.charEnd - entry.charStart;
            if (itemLen > 0) {
              if (i === 0 && sentCharStart > entry.charStart) {
                fracLeft = (sentCharStart - entry.charStart) / itemLen;
              }
              if (i === overlapping.length - 1 && sentCharEnd < entry.charEnd) {
                fracRight = (sentCharEnd - entry.charStart) / itemLen;
              }
            }
          }
        }

        rects.push({
          left: Math.min(x1, x2) + fullWidth * fracLeft,
          top: Math.min(y1, y2),
          width: fullWidth * (fracRight - fracLeft),
          height: Math.abs(y2 - y1),
        });
      }

      // Strip decorative symbols (Ⓐ Ⓑ ● ■ etc.) from the final text
      const sentenceText = concat
        .slice(sentCharStart, sentCharEnd)
        .replace(/[\u2460-\u24FF\u2700-\u27BF●■□▪▫◆◇★☆►▶‣⁃※†‡§¶]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return { text: sentenceText, rects };
    },
    [ensureTextContent],
  );

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
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 100);
        return;
      }
      // Only trigger on leaf text elements (no child elements, has text content)
      if (el.childElementCount > 0 || !(el.textContent ?? "").trim()) {
        clearShow();
        clearHide();
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 100);
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
        hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 100);
        return;
      }
      clearHide();
      clearShow();
      hoverShowTimer.current = setTimeout(async () => {
        if (popupActiveRef.current) return;
        const { text, rects } = await extractSentence(el, e.clientX);
        if (text && /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(text)) {
          clearHighlight();
          setHighlightRects(rects);
          setHoverPopup({ x: e.clientX, y: e.clientY, text });
        }
      }, 400);
    };

    const handleMouseLeave = () => {
      clearShow();
      clearHide();
      clearHighlight();
      hoverHideTimer.current = setTimeout(() => setHoverPopup(null), 300);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      clearShow();
      clearHide();
      clearHighlight();
    };
  }, [extractSentence, file, clearHighlight]);

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
      if (hoverPopupEl && !hoverPopupEl.contains(e.target as Node))
        setHoverPopup(null);

      const textLayer = containerRef.current?.querySelector(
        ".react-pdf__Page__textContent",
      );
      // Check if click is on a popup (selection or hover) — don't clear in that case
      const selPopupEl = document.getElementById("pdf-selection-popup");
      const hvrPopupEl = document.getElementById("pdf-hover-popup");
      const isOnPopup =
        selPopupEl?.contains(e.target as Node) ||
        hvrPopupEl?.contains(e.target as Node);

      if (textLayer?.contains(e.target as Node)) {
        dragStartPoint.current = { x: e.clientX, y: e.clientY };
        isDragging.current = true;
        // Clear previous selection and hover highlight when starting new drag
        setSelectionRects([]);
        setHighlightRects([]);
      } else if (!isOnPopup) {
        dragStartPoint.current = null;
        // Focus-out: clicking outside text layer and popups clears selection
        setSelectionRects([]);
        setPopup(null);
      }
    };

    const handleMouseMoveDrag = async (e: MouseEvent) => {
      if (!isDragging.current || !dragStartPoint.current) return;
      const start = dragStartPoint.current;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      if (dx * dx + dy * dy < 25) return; // minimum drag distance

      const textLayer = containerRef.current?.querySelector(
        ".react-pdf__Page__textContent",
      );
      if (!textLayer) return;

      const startCaret = getCaretRange(start.x, start.y);
      const endCaret = getCaretRange(e.clientX, e.clientY);
      if (!startCaret || !endCaret) return;
      if (
        !textLayer.contains(startCaret.startContainer) ||
        !textLayer.contains(endCaret.startContainer)
      )
        return;

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
          setSelectionRects([]);
          return;
        }
        const rects = await computeRangeRects(range, textLayer);
        setSelectionRects(rects);
      } catch {
        /* ignore */
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      isDragging.current = false;
      setTimeout(async () => {
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
            return;
          }

          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);

          const rects = await computeRangeRects(range, textLayer);
          setSelectionRects(rects);
          setPopup({ x: e.clientX, y: e.clientY, text });
          setPopupTranslation(null);
        } catch {
          setPopup(null);
        }
      }, 10);
    };

    const handleDblClick = (e: MouseEvent) => {
      const textLayer = containerRef.current?.querySelector(
        ".react-pdf__Page__textContent",
      );
      if (!textLayer?.contains(e.target as Node)) return;
      // Browser word-selects on dblclick; read that selection after
      // handleMouseUp's timeout (10ms) has already run and skipped.
      setTimeout(async () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        try {
          const range = sel.getRangeAt(0);
          if (!textLayer.contains(range.commonAncestorContainer)) return;
          const text = range.toString().trim();
          if (!text) return;

          const rects = await computeRangeRects(range, textLayer);
          setSelectionRects(rects);
          setPopup({ x: e.clientX, y: e.clientY, text });
          setPopupTranslation(null);
        } catch {
          /* ignore */
        }
      }, 50);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMoveDrag);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("dblclick", handleDblClick);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMoveDrag);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("dblclick", handleDblClick);
    };
  }, [computeRangeRects]);

  const handleFileChange = useCallback((f: File) => {
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
    setAnnotations([]);
    setIsNoteMode(false);
    setPendingNote(null);
    setEditingAnnot(null);
    pdfDocRef.current = null;

    const meta = upsertLibraryMeta(f);
    const existing = meta.find((m) => m.name === f.name);
    const existingServerId = existing?.serverId ?? null;
    setServerId(existingServerId);
    localStorage.setItem(LIBRARY_CURRENT_KEY, f.name);
    savePdfToLibrary(f).catch(() => { /* ignore IDB errors */ });

    // Upload to server in background if not already done
    if (!existingServerId) {
      const formData = new FormData();
      formData.append("file", f);
      fetch("/api/pdfs", { method: "POST", body: formData })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) {
            setServerId(data.id);
            setLibraryMetaServerId(f.name, data.id);
          }
        })
        .catch(() => { /* ignore upload errors */ });
    }
  }, []);

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
    /* pageImage removed */ localStorage.removeItem(LIBRARY_CURRENT_KEY);
    onClose?.();
  };

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
      <div className="flex-1 flex overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          className="hidden"
        />
        <div
          className={`flex-1 flex flex-col items-center justify-center overflow-hidden transition-colors ${
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
          </div>
          <p className="text-xs text-gray-400 mt-4">
            업로드 없이 브라우저에서만 사용됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleInputChange}
        className="hidden"
      />
      <div
        className="relative flex-1 flex flex-col overflow-hidden bg-gray-50"
        ref={containerRef}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 shrink-0">
          {/* Center section: file name */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-sm text-gray-600 truncate max-w-[200px]"
              title={file.name}
            >
              {file.name}
            </span>
          </div>

          {/* Right section: language, TOC, search, close */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Language selector button */}
            <button
              onClick={() => setShowLangModal(true)}
              title="학습 언어 선택"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                language
                  ? "text-gray-600 hover:bg-gray-100"
                  : "text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200"
              }`}
            >
              {language ? (
                <>
                  <span className="text-sm leading-none">
                    {TTS_LANGUAGES.find((l) => l.code === language)?.flag}
                  </span>
                  <span>{TTS_LANGUAGES.find((l) => l.code === language)?.label}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                  </svg>
                  <span>언어 선택</span>
                </>
              )}
            </button>
            {/* TOC button */}
            {toc.length > 0 && (
              <div
                className="relative"
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
              className="relative"
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
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="닫기"
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
        </div>

        {/* Page area */}
        <div className="flex-1 overflow-y-auto flex justify-center items-start px-4 py-4 pb-16">
          <Document
            file={file}
            options={DOCUMENT_OPTIONS}
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
            <div
              className="relative"
              onClick={(e) => {
                if (!isNoteMode) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                setPendingNote({ xPct, yPct });
                setNoteText("");
                setEditingAnnot(null);
              }}
              style={isNoteMode ? { cursor: "crosshair" } : undefined}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                className="shadow-md"
                width={
                  Math.min(
                    (containerRef.current?.clientWidth ?? 600) - 32,
                    760,
                  ) * scale
                }
                onRenderSuccess={() => {
                  onPageChange?.(pageNumber);
                }}
              />
              {/* Canvas-accurate hover highlight overlay (light blue) */}
              {highlightRects.map((rect, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    backgroundColor: "rgba(250, 204, 21, 0.35)",
                    borderRadius: 2,
                    zIndex: 3,
                  }}
                />
              ))}
              {/* Canvas-accurate selection highlight overlay (darker blue) */}
              {selectionRects.map((rect, i) => (
                <div
                  key={`s-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    backgroundColor: "rgba(250, 204, 21, 0.45)",
                    borderRadius: 2,
                    zIndex: 4,
                  }}
                />
              ))}
              {/* Annotation pins */}
              {annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="absolute"
                  style={{
                    left: `${ann.x_pct}%`,
                    top: `${ann.y_pct}%`,
                    transform: "translate(-50%, -100%)",
                    zIndex: 10,
                  }}
                >
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAnnot(ann);
                      setNoteText(ann.text);
                      setNoteColor(ann.color);
                      setPendingNote(null);
                    }}
                    title={ann.text}
                    className="text-lg leading-none hover:scale-125 transition-transform"
                  >
                    📌
                  </button>
                  {/* Edit popover */}
                  {editingAnnot?.id === ann.id && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-20 flex flex-col gap-2"
                      style={{ top: "100%" }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        className="w-full text-xs border border-gray-200 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        {["yellow", "pink", "green", "blue"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setNoteColor(c)}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${noteColor === c ? "scale-125 border-gray-700" : "border-transparent"}`}
                            style={{ backgroundColor: c === "yellow" ? "#fef08a" : c === "pink" ? "#fecdd3" : c === "green" ? "#bbf7d0" : "#bfdbfe" }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1.5 justify-end">
                        <button
                          className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5"
                          onClick={async () => {
                            if (!serverId) return;
                            await deleteAnnotation(serverId, ann.id);
                            setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
                            setEditingAnnot(null);
                          }}
                        >
                          삭제
                        </button>
                        <button
                          className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded"
                          onClick={() => setEditingAnnot(null)}
                        >
                          취소
                        </button>
                        <button
                          className="text-xs bg-blue-500 text-white hover:bg-blue-600 px-2 py-0.5 rounded"
                          onClick={async () => {
                            if (!serverId) return;
                            const updated = await updateAnnotation(serverId, ann.id, noteText, noteColor);
                            if (updated) {
                              setAnnotations((prev) => prev.map((a) => a.id === ann.id ? updated : a));
                            }
                            setEditingAnnot(null);
                          }}
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {/* Pending new note form */}
              {pendingNote && (
                <div
                  className="absolute z-20"
                  style={{
                    left: `${pendingNote.xPct}%`,
                    top: `${pendingNote.yPct}%`,
                    transform: "translate(-50%, 4px)",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex flex-col gap-2">
                    <textarea
                      className="w-full text-xs border border-gray-200 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                      rows={3}
                      placeholder="메모 입력..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      {["yellow", "pink", "green", "blue"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setNoteColor(c)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform ${noteColor === c ? "scale-125 border-gray-700" : "border-transparent"}`}
                          style={{ backgroundColor: c === "yellow" ? "#fef08a" : c === "pink" ? "#fecdd3" : c === "green" ? "#bbf7d0" : "#bfdbfe" }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded"
                        onClick={() => setPendingNote(null)}
                      >
                        취소
                      </button>
                      <button
                        className="text-xs bg-blue-500 text-white hover:bg-blue-600 px-2 py-0.5 rounded disabled:opacity-50"
                        disabled={!noteText.trim()}
                        onClick={async () => {
                          if (!serverId || !noteText.trim()) return;
                          const created = await createAnnotation(
                            serverId, pageNumber,
                            pendingNote.xPct, pendingNote.yPct,
                            noteText.trim(), noteColor,
                          );
                          if (created) setAnnotations((prev) => [...prev, created]);
                          setPendingNote(null);
                          setNoteText("");
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Document>

        </div>

        {/* Floating bottom toolbar */}
        {file && numPages > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1 py-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg text-sm text-gray-600 min-w-max">
            {/* Zoom out */}
            <button
              onClick={() =>
                setScale((s) =>
                  Math.max(0.5, parseFloat((s - 0.1).toFixed(1))),
                )
              }
              title="축소"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
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
                  d="M20 12H4"
                />
              </svg>
            </button>
            {/* Fit */}
            <button
              onClick={() => setScale(1.0)}
              title="맞춤"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
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
                  d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
                />
              </svg>
            </button>
            {/* Zoom in */}
            <button
              onClick={() =>
                setScale((s) =>
                  Math.min(2.0, parseFloat((s + 0.1).toFixed(1))),
                )
              }
              title="확대"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
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
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Prev page */}
            <button
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              title="이전 페이지"
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            {/* Page indicator */}
            <div className="flex items-center gap-1 text-xs tabular-nums px-1">
              {pageInputStr === null ? (
                <button
                  onClick={() => setPageInputStr(String(pageNumber))}
                  title="클릭하여 페이지 입력"
                  className="min-w-6 text-center hover:bg-gray-100 rounded px-0.5"
                >
                  {pageNumber}
                </button>
              ) : (
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={pageInputStr ?? ""}
                  onChange={(e) => setPageInputStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(pageInputStr ?? "", 10);
                      if (!isNaN(n) && n >= 1 && n <= numPages)
                        setPageNumber(n);
                      setPageInputStr(null);
                    } else if (e.key === "Escape") {
                      setPageInputStr(null);
                    }
                  }}
                  onBlur={() => {
                    const n = parseInt(pageInputStr ?? "", 10);
                    if (!isNaN(n) && n >= 1 && n <= numPages)
                      setPageNumber(n);
                    setPageInputStr(null);
                  }}
                  className="w-8 text-center border border-blue-400 rounded focus:outline-none"
                />
              )}
              <span className="text-gray-400">/ {numPages}</span>
            </div>
            {/* Next page */}
            <button
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              title="다음 페이지"
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Search */}
            <button
              onClick={() => {
                if (searchLeaveTimerRef.current)
                  clearTimeout(searchLeaveTimerRef.current);
                setShowSearch((v) => !v);
              }}
              title="검색 (⌘F)"
              className={`p-1.5 rounded-md transition-colors ${showSearch ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100"}`}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
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
            {/* Note mode toggle — only when PDF is server-uploaded */}
            {serverId && (
              <>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <button
                  onClick={() => {
                    setIsNoteMode((v) => !v);
                    setPendingNote(null);
                  }}
                  title={isNoteMode ? "메모 모드 끄기" : "메모 추가"}
                  className={`p-1.5 rounded-md transition-colors ${isNoteMode ? "bg-yellow-100 text-yellow-700" : "hover:bg-gray-100"}`}
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Hover popup */}
        {hoverPopup && !popup && (
          <div
            id="pdf-hover-popup"
            className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden flex"
            style={{
              left: Math.min(hoverPopup.x - 4, window.innerWidth - 220),
              top:
                hoverPopup.y - 52 < 8 ? hoverPopup.y + 20 : hoverPopup.y - 52,
            }}
            onMouseEnter={() => {
              if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
            }}
            onMouseLeave={() => {
              hoverHideTimer.current = setTimeout(
                () => setHoverPopup(null),
                200,
              );
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
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden flex flex-col"
            style={{
              left: Math.min(popup.x - 4, window.innerWidth - 320),
              top: popup.y - 52 < 8 ? popup.y + 20 : popup.y - 52,
            }}
            onMouseLeave={(e) => {
              hoverBlockOriginRef.current = { x: e.clientX, y: e.clientY };
              setPopup(null);
              setPopupTranslation(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
          <div className="flex">
            {/* 소리 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => speak(popup.text)}
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
            {/* 복사 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                navigator.clipboard.writeText(popup.text);
                setPopup(null);
                window.getSelection()?.removeAllRanges();
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
            {/* 질문하기 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                hoverBlockOriginRef.current = { x: e.clientX, y: e.clientY };
                onTextSelect({ text: popup.text, id: Date.now() });
                setPopup(null);
                window.getSelection()?.removeAllRanges();
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
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3z"
                />
              </svg>
              질문하기
            </button>
            <div className="w-px bg-gray-200" />
            {/* 연습 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPracticePdfText(popup.text);
                setPopup(null);
                window.getSelection()?.removeAllRanges();
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

        {/* Pronunciation practice modal */}
        {practicePdfText && (
          <PronunciationModal
            key={practicePdfText}
            text={practicePdfText}
            speak={speak}
            lang={language ?? "de-DE"}
            onClose={() => setPracticePdfText(null)}
          />
        )}

        {/* Language selection modal */}
        {showLangModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowLangModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-80 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-sm font-semibold text-gray-800 mb-1">학습 언어 선택</h2>
              <p className="text-xs text-gray-400 mb-4">
                선택한 언어로 발음(TTS)이 재생됩니다.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TTS_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onLanguageChange(lang.code);
                      setShowLangModal(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      language === lang.code
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <span className="text-xl leading-none">{lang.flag}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{lang.label}</div>
                      <div className="text-[10px] text-gray-400 truncate">{lang.name}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowLangModal(false)}
                className="mt-4 w-full py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PdfViewer = forwardRef(PdfViewerInner);
export default PdfViewer;
