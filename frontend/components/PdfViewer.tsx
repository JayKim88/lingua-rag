"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import PronunciationModal from "./PronunciationModal";
import { TTS_LANGUAGES } from "@/hooks/useTTS";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  savePdfToLibrary,
  loadPdfFromLibrary,
  migratePdfKey,
  deletePdfFromLibrary,
  getLibraryMeta,
  upsertLibraryMeta,
  removeLibraryMeta,
  setLibraryMetaPdfServerId,
  generateChatId,
  LIBRARY_CURRENT_KEY,
  type PdfMeta,
} from "@/lib/pdfLibrary";
import {
  fetchAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  moveAnnotation,
  fetchPdfLanguage,
  savePdfLanguage,
  fetchLastPage,
  saveLastPage,
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

export interface PdfViewerHandle {
  getPageText: () => Promise<string | null>;
  getNumPages: () => number;
  hasFile: () => boolean;
}

interface PdfViewerProps {
  onTextSelect: (payload: { text: string; id: number }) => void;
  onPageChange?: (pageNumber: number) => void;
  speak: (text: string) => void;
  speakWithOptions?: (
    text: string,
    opts: { volume?: number; rate?: number },
  ) => void;
  language: string | null;
  onLanguageChange: (lang: string | null) => void;
  openFile?: File | null; // external file to open (set by parent modal)
  onClose?: () => void; // called when the viewer's close button is clicked
  pdfServerId?: string | null; // server PDF ID (set by parent after upload)
}

const STICKY_COLORS: Record<string, { header: string; body: string }> = {
  yellow: { header: "#f59e0b", body: "#fef9c3" },
  pink:   { header: "#f472b6", body: "#fce7f3" },
  green:  { header: "#4ade80", body: "#dcfce7" },
  blue:   { header: "#60a5fa", body: "#dbeafe" },
};

function PdfViewerInner(
  {
    onTextSelect,
    onPageChange,
    speak,
    speakWithOptions,
    language,
    onLanguageChange,
    openFile,
    onClose,
    pdfServerId: pdfServerIdProp,
  }: PdfViewerProps,
  ref: React.ForwardedRef<PdfViewerHandle>,
) {
  // Stable reference across HMR re-evaluations (avoids react-pdf "options changed" warning)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const documentOptions = useMemo(() => DOCUMENT_OPTIONS, []);

  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [popup, setPopup] = useState<SelectionPopup | null>(null);
  const [popupTranslation, setPopupTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTtsPanel, setShowTtsPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tempVolume, setTempVolume] = useState(() => {
    try {
      const v = localStorage.getItem("tts_volume");
      return v ? Number(v) : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [tempRate, setTempRate] = useState(() => {
    try {
      const v = localStorage.getItem("tts_rate");
      return v ? Number(v) : 0.9;
    } catch {
      return 0.9;
    }
  });
  const [practicePdfText, setPracticePdfText] = useState<string | null>(null);
  const [showLangModal, setShowLangModal] = useState(false);
  const [pendingLang, setPendingLang] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [pageInputStr, setPageInputStr] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pageHeight, setPageHeight] = useState<number>(0);
  const [pdfReady, setPdfReady] = useState(false); // true after page restore + first render

  // Server-side PDF ID (for annotations, language, last-page, etc.)
  const [pdfServerId, setPdfServerId] = useState<string | null>(null);
  // Monotonic counter to force Document remount on every file change
  const [fileGeneration, setFileGeneration] = useState(0);

  // Spotlight search drag state (percentage-based for responsive)
  const [spotlightPos, setSpotlightPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 50, y: 5 };
    try {
      const saved = localStorage.getItem("lingua_spotlight_pos");
      return saved ? JSON.parse(saved) : { x: 50, y: 5 };
    } catch { return { x: 50, y: 5 }; }
  });
  const spotlightDrag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  // Annotation state
  const [isStickyMode, setIsStickyMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pendingSticky, setPendingSticky] = useState<{
    xPct: number;
    yPct: number;
  } | null>(null);
  const [editingSticky, setEditingSticky] = useState<Annotation | null>(null);
  const [stickyText, setStickyText] = useState("");
  const [stickyColor, setStickyColor] = useState("yellow");

  // Pin drag state
  const pinDragRef = useRef<{
    ann: Annotation;
    pageEl: Element;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const pinWasDraggedRef = useRef(false);
  const [draggingPin, setDraggingPin] = useState<{
    annId: string;
    xPct: number;
    yPct: number;
  } | null>(null);



  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Highlight search terms on the PDF text layer
  const searchHighlightRenderer = useCallback(
    (textItem: { str: string }) => {
      if (!searchQuery.trim()) return textItem.str;
      const query = searchQuery.trim();
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");
      return textItem.str.replace(
        regex,
        '<mark style="background:rgba(250,204,21,0.5);color:inherit;padding:0;border-radius:2px">$1</mark>',
      );
    },
    [searchQuery],
  );

  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const lastPageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPageRef = useRef<number>(1);
  const pdfReadyRef = useRef(false);

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
      getPageNumber: () => pageNumber,
      getNumPages: () => numPages,
      hasFile: () => !!file,
      getPdfId: () => pdfServerId,
    }),
    [pageNumber, numPages, file, pdfServerId],
  );

  const scrollToPage = useCallback(
    (n: number, instant = false) => {
      const clamped = Math.max(1, Math.min(numPages, n));
      setPageNumber(clamped);
      const el = pageContainerRefs.current[clamped - 1];
      if (el)
        el.scrollIntoView({
          block: "start",
          behavior: instant ? "instant" : "auto",
        });
    },
    [numPages],
  );

  // Keep pdfReadyRef in sync so IntersectionObserver callback can check it without stale closure
  useEffect(() => {
    pdfReadyRef.current = pdfReady;
  }, [pdfReady]);

  // IntersectionObserver: update pageNumber to the most visible page
  const pageRatios = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (numPages === 0) return;
    const container = containerRef.current;
    if (!container) return;
    pageRatios.current.clear();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          pageRatios.current.set(page, entry.intersectionRatio);
        }

        if (!pdfReadyRef.current) return;

        let bestPage = 0;
        let bestRatio = 0;
        for (const [page, ratio] of pageRatios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = page;
          }
        }
        if (bestPage > 0 && bestRatio > 0) setPageNumber(bestPage);
      },
      {
        root: container.querySelector(".pdf-scroll-area"),
        threshold: Array.from({ length: 11 }, (_, i) => i / 10),
      },
    );

    pageContainerRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [numPages, scale]);

  // Load all annotations in a single request when pdfServerId changes
  useEffect(() => {
    if (!pdfServerId) {
      setAnnotations([]);
      return;
    }
    fetchAnnotations(pdfServerId)
      .then(setAnnotations)
      .catch(() => {});
  }, [pdfServerId]);

  // Pin drag — move annotation to new position on mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = pinDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        drag.hasMoved = true;
      }
      if (drag.hasMoved) {
        const rect = drag.pageEl.getBoundingClientRect();
        const xPct = Math.max(
          0,
          Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
        );
        const yPct = Math.max(
          0,
          Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
        );
        setDraggingPin({ annId: drag.ann.id, xPct, yPct });
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const drag = pinDragRef.current;
      if (!drag) return;
      pinDragRef.current = null;
      if (!drag.hasMoved) {
        setDraggingPin(null);
        return;
      }
      pinWasDraggedRef.current = true;
      const rect = drag.pageEl.getBoundingClientRect();
      const xPct = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
      );
      const yPct = Math.max(
        0,
        Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
      );
      // Optimistic update
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === drag.ann.id ? { ...a, x_pct: xPct, y_pct: yPct } : a,
        ),
      );
      setDraggingPin(null);
      if (pdfServerId) {
        await moveAnnotation(pdfServerId, drag.ann.id, xPct, yPct);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [pdfServerId]);

  // Load saved language for this PDF when pdfServerId is set.
  // If the user already chose a language (from the immediate modal), persist it to the server.
  // Otherwise, auto-open the language picker so the user chooses.
  useEffect(() => {
    if (!pdfServerId) return;
    fetchPdfLanguage(pdfServerId)
      .then((serverLang) => {
        if (serverLang) {
          // Server already has a language — use it
          onLanguageChange(serverLang);
        } else if (language) {
          // User already selected a language before pdfServerId was ready — save it now
          savePdfLanguage(pdfServerId, language).catch(() => {});
        } else {
          // No language at all — prompt user to choose
          setPendingLang(null);
          setShowLangModal(true);
        }
      })
      .catch(() => {});
  }, [pdfServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last viewed page when PDF loads (pdfServerId + numPages both ready)
  useEffect(() => {
    if (!pdfServerId || numPages === 0) return;
    fetchLastPage(pdfServerId)
      .then((page) => {
        lastSavedPageRef.current = page;
        if (page > 1) scrollToPage(page, true);
        setPdfReady(true);
      })
      .catch(() => {
        setPdfReady(true);
      });
  }, [pdfServerId, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save last page with 1.5s debounce on pageNumber change
  useEffect(() => {
    if (!pdfServerId || pageNumber < 1) return;
    if (lastPageSaveTimer.current) clearTimeout(lastPageSaveTimer.current);
    lastPageSaveTimer.current = setTimeout(() => {
      if (pageNumber === lastSavedPageRef.current) return;
      saveLastPage(pdfServerId, pageNumber).catch(() => {});
      lastSavedPageRef.current = pageNumber;
    }, 1500);
    return () => {
      if (lastPageSaveTimer.current) clearTimeout(lastPageSaveTimer.current);
    };
  }, [pdfServerId, pageNumber]);

  // Separate state for drag/dblclick selection highlights (persists until focus-out)
  const [selectionRects, setSelectionRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);

  // Dismiss selection popup & highlights on scroll
  const popupRef = useRef(popup);
  const selectionRectsRef = useRef(selectionRects);
  popupRef.current = popup;
  selectionRectsRef.current = selectionRects;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollArea = container.querySelector(".pdf-scroll-area");
    if (!scrollArea) return;

    const handleScroll = () => {
      if (popupRef.current || selectionRectsRef.current.length > 0) {
        setPopup(null);
        setSelectionRects([]);
        setPopupTranslation(null);
        window.getSelection()?.removeAllRanges();
        // Reset drag state so next mousedown starts cleanly
        isDragging.current = false;
        dragStartPoint.current = null;
      }
    };

    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollArea.removeEventListener("scroll", handleScroll);
  }, [numPages]); // re-attach after PDF loads and scroll area mounts

  const isDragging = useRef(false);
  // Cache: textContent items + viewport for the current page
  const textContentCache = useRef<{
    page: number;
    scale: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    viewport: { scale: number; width: number; height: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawViewport: any;
  } | null>(null);

  // Open file passed from parent (modal selection) — parent handles upload, skip it here
  useEffect(() => {
    if (openFile) {
      handleFileChange(openFile, true);
      // New upload (no server ID yet) → show language picker immediately
      if (!pdfServerIdProp) {
        setPendingLang(null);
        setShowLangModal(true);
      }
    }
  }, [openFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync pdfServerId prop from parent (set after parent-level upload completes)
  useEffect(() => {
    if (pdfServerIdProp) setPdfServerId(pdfServerIdProp);
  }, [pdfServerIdProp]);

  // Restore last-opened PDF on mount (+ restore pdfServerId from meta)
  useEffect(() => {
    const currentChatId = localStorage.getItem(LIBRARY_CURRENT_KEY);
    if (!currentChatId) {
      setIsRestoring(false);
      return;
    }
    const library = getLibraryMeta();
    // Try chatId lookup first; fallback to name for migration from old format
    const meta = library.find((m) => m.chatId === currentChatId)
      ?? library.find((m) => m.name === currentChatId);
    if (!meta?.chatId) {
      setIsRestoring(false);
      return;
    }
    if (meta.pdfServerId) setPdfServerId(meta.pdfServerId);
    // Update LIBRARY_CURRENT_KEY to chatId if it was stored as name
    if (currentChatId !== meta.chatId) {
      localStorage.setItem(LIBRARY_CURRENT_KEY, meta.chatId);
    }
    loadPdfFromLibrary(meta.chatId).then(async (saved) => {
      // Migration: try old name-based key if chatId key not found
      if (!saved) saved = await migratePdfKey(meta.name, meta.chatId!);
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

  // Spotlight drag-to-move (uses document-level mousemove/mouseup for smooth dragging)
  const spotlightPosRef = useRef(spotlightPos);
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const d = spotlightDrag.current;
      if (!d || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const xPct = d.origX + ((e.clientX - d.startX) / rect.width) * 100;
      const yPct = d.origY + ((e.clientY - d.startY) / rect.height) * 100;
      const next = { x: Math.max(5, Math.min(95, xPct)), y: Math.max(0, Math.min(80, yPct)) };
      spotlightPosRef.current = next;
      setSpotlightPos(next);
    };
    const onMouseUp = () => {
      if (spotlightDrag.current) {
        spotlightDrag.current = null;
        localStorage.setItem("lingua_spotlight_pos", JSON.stringify(spotlightPosRef.current));
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Load/cache textContent items for the current page.
  // Uses pageNumberRef to always read the current page (avoids stale closures).
  const ensureTextContent = useCallback(async () => {
    const currentPage = pageNumberRef.current;
    const currentScale = scaleRef.current;
    if (!pdfDocRef.current) return null;
    if (
      textContentCache.current?.page === currentPage &&
      textContentCache.current?.scale === currentScale
    )
      return textContentCache.current;
    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const containerW = containerRef.current?.clientWidth ?? 600;
      const desiredWidth = Math.min(containerW - 32, 760) * currentScale;
      const defaultVp = page.getViewport({ scale: 1 });
      const fitScale = desiredWidth / defaultVp.width;
      const viewport = page.getViewport({ scale: fitScale });
      const content = await page.getTextContent();
      textContentCache.current = {
        page: currentPage,
        scale: currentScale,
        items: content.items ?? [],
        viewport: {
          scale: fitScale,
          width: viewport.width,
          height: viewport.height,
        },
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
      const pgEl = textLayerEl.closest(".react-pdf__Page");
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

  // Reset TTS panel and temp values on popup open/close
  useEffect(() => {
    if (popup === null) {
      setShowTtsPanel(false);
    } else {
      // New sentence selected — restore temp values to current persistent settings
      try {
        const v = localStorage.getItem("tts_volume");
        const r = localStorage.getItem("tts_rate");
        setTempVolume(v ? Number(v) : 0.8);
        setTempRate(r ? Number(r) : 0.9);
      } catch {
        /* ignore */
      }
    }
  }, [popup]);
  // Find the text layer (react-pdf__Page__textContent) that contains a given node.
  // Needed because multi-page rendering creates one text layer per page.
  function findTextLayer(node: Node): Element | null {
    const layers = containerRef.current?.querySelectorAll(
      ".react-pdf__Page__textContent",
    );
    if (!layers) return null;
    for (const layer of Array.from(layers)) {
      if (layer.contains(node)) return layer;
    }
    return null;
  }

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
        setPopup(null);
      }

      const textLayer = findTextLayer(e.target as Node);
      const isOnPopup = popupEl?.contains(e.target as Node);

      if (textLayer?.contains(e.target as Node)) {
        dragStartPoint.current = { x: e.clientX, y: e.clientY };
        isDragging.current = true;
        setSelectionRects([]);
      } else if (!isOnPopup) {
        dragStartPoint.current = null;
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

      const startCaret = getCaretRange(start.x, start.y);
      const endCaret = getCaretRange(e.clientX, e.clientY);
      if (!startCaret || !endCaret) return;
      const textLayer = findTextLayer(startCaret.startContainer);
      if (!textLayer) return;
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
        const start = dragStartPoint.current;
        dragStartPoint.current = null;
        if (!start) return;

        const startCaret = getCaretRange(start.x, start.y);
        const endCaret = getCaretRange(e.clientX, e.clientY);
        if (!startCaret || !endCaret) {
          setPopup(null);
          return;
        }

        const textLayer = findTextLayer(startCaret.startContainer);
        if (!textLayer) {
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
      const textLayer = findTextLayer(e.target as Node);
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

    // Re-open popup when hovering back over still-active selection highlight
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

  const handleFileChange = useCallback((f: File, skipUpload = false) => {
    if (f.type !== "application/pdf") return;
    setFile(f);
    setFileGeneration((g) => g + 1);
    setNumPages(0);
    setPageNumber(1);
    setPageHeight(0);
    setPdfReady(false);
    lastSavedPageRef.current = 1;
    pageContainerRefs.current = [];
    setPopup(null);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setAnnotations([]);
    setIsStickyMode(false);
    setPendingSticky(null);
    setEditingSticky(null);
    pdfDocRef.current = null;

    // Find or create chatId for this file
    const library = getLibraryMeta();
    const existingEntry = library.find((m) => m.name === f.name);
    const chatId = existingEntry?.chatId ?? generateChatId();
    const meta = upsertLibraryMeta(f, chatId);
    const existing = meta.find((m) => m.chatId === chatId);
    const existingServerId = existing?.pdfServerId ?? null;
    setPdfServerId(existingServerId);
    localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);
    savePdfToLibrary(f, chatId).catch(() => {
      /* ignore IDB errors */
    });

    // Upload to server in background if not already done (skip when parent handles it)
    if (!existingServerId && !skipUpload) {
      const formData = new FormData();
      formData.append("file", f);
      fetch("/api/pdfs", { method: "POST", body: formData })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) {
            setPdfServerId(data.id);
            setLibraryMetaPdfServerId(chatId, data.id);
          }
        })
        .catch(() => {
          /* ignore upload errors */
        });
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

        {/* Loading overlay — shown until page restore is complete */}
        {!pdfReady && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-50">
            <span className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Page area */}
        <div className="pdf-scroll-area flex-1 overflow-y-auto flex flex-col items-center px-4 py-4 pb-16">
          <Document
            key={`${file.name}-${fileGeneration}`}
            file={file}
            options={DOCUMENT_OPTIONS}
            onLoadSuccess={async (pdf) => {
              setNumPages(pdf.numPages);
              pdfDocRef.current = pdf;
              // No pdfServerId → no page restore needed, show immediately
              if (!pdfServerId) setPdfReady(true);
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
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
              const pageWidth =
                Math.min((containerRef.current?.clientWidth ?? 600) - 32, 760) *
                scale;
              // Only render pages within ±3 of current page; show placeholder for others
              const inWindow = Math.abs(n - pageNumber) <= 3;
              const placeholderHeight =
                pageHeight > 0 ? pageHeight : pageWidth * 1.414;
              return (
                <div
                  key={n}
                  data-page={n}
                  ref={(el) => {
                    pageContainerRefs.current[n - 1] = el;
                  }}
                  className="relative mb-4"
                  onClick={(e) => {
                    if (!isStickyMode || n !== pageNumber) return;
                    const rect = (
                      e.currentTarget as HTMLDivElement
                    ).getBoundingClientRect();
                    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                    setPendingSticky({ xPct, yPct });
                    setStickyText("");
                    setEditingSticky(null);
                  }}
                  style={
                    isStickyMode && n === pageNumber
                      ? { cursor: "crosshair" }
                      : undefined
                  }
                >
                  {inWindow ? (
                    <Page
                      pageNumber={n}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                      customTextRenderer={searchQuery.trim() ? searchHighlightRenderer : undefined}
                      className="shadow-md"
                      width={pageWidth}
                      onRenderSuccess={(page) => {
                        if (n === 1) setPageHeight(page.height);
                        if (n === pageNumber) onPageChange?.(pageNumber);
                      }}
                    />
                  ) : (
                    <div
                      className="shadow-md bg-white"
                      style={{ width: pageWidth, height: placeholderHeight }}
                    />
                  )}
                  {/* Canvas-accurate selection highlight overlay */}
                  {n === pageNumber &&
                    selectionRects.map((rect, i) => (
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
                  {/* Annotation pins for this page */}
                  {annotations
                    .filter((ann) => ann.page_num === n)
                    .map((ann) => (
                      <div
                        key={ann.id}
                        className="absolute"
                        style={{
                          left: `${draggingPin?.annId === ann.id ? draggingPin.xPct : ann.x_pct}%`,
                          top: `${draggingPin?.annId === ann.id ? draggingPin.yPct : ann.y_pct}%`,
                          transform: "translate(-50%, -100%)",
                          zIndex: 10,
                          cursor:
                            draggingPin?.annId === ann.id ? "grabbing" : "grab",
                        }}
                      >
                        <button
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const pageEl = (e.currentTarget as Element).closest(
                              "[data-page]",
                            );
                            if (!pageEl) return;
                            pinDragRef.current = {
                              ann,
                              pageEl,
                              startX: e.clientX,
                              startY: e.clientY,
                              hasMoved: false,
                            };
                          }}
                          onClick={(e) => {
                            if (pinWasDraggedRef.current) {
                              pinWasDraggedRef.current = false;
                              return;
                            }
                            e.stopPropagation();
                            setEditingSticky(ann);
                            setStickyText(ann.text);
                            setStickyColor(ann.color);
                            setPendingSticky(null);
                          }}
                          title={ann.text}
                          className="text-lg leading-none hover:scale-125 transition-transform"
                          style={{ cursor: "inherit" }}
                        >
                          📌
                        </button>
                        {/* Edit popover — Windows Sticky Note style */}
                        {editingSticky?.id === ann.id && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 mt-1 z-20 rounded-lg shadow-2xl overflow-hidden flex flex-col"
                            style={{
                              top: "100%",
                              width: "220px",
                              backgroundColor: STICKY_COLORS[stickyColor]?.body ?? "#fef9c3",
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Header bar */}
                            <div
                              className="flex items-center px-2 py-1.5 gap-1.5"
                              style={{ backgroundColor: STICKY_COLORS[stickyColor]?.header ?? "#f59e0b" }}
                            >
                              {["yellow", "pink", "green", "blue"].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => setStickyColor(c)}
                                  className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-110"
                                  style={{
                                    backgroundColor: STICKY_COLORS[c]?.body ?? "#fef9c3",
                                    outline: stickyColor === c ? "2px solid white" : "none",
                                    outlineOffset: "1px",
                                  }}
                                />
                              ))}
                              <div className="flex-1" />
                              <button
                                className="text-white/80 hover:text-white transition-colors"
                                title="삭제"
                                onClick={async () => {
                                  if (!pdfServerId) return;
                                  await deleteAnnotation(pdfServerId, ann.id);
                                  setAnnotations((prev) =>
                                    prev.filter((a) => a.id !== ann.id),
                                  );
                                  setEditingSticky(null);
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                            {/* Body */}
                            <textarea
                              className="w-full text-sm p-2.5 resize-none focus:outline-none bg-transparent leading-relaxed"
                              rows={4}
                              value={stickyText}
                              onChange={(e) => setStickyText(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingSticky(null);
                              }}
                            />
                            {/* Footer */}
                            <div className="flex justify-end px-2 pb-2 gap-2">
                              <button
                                className="text-xs opacity-50 hover:opacity-80 transition-opacity"
                                onClick={() => setEditingSticky(null)}
                              >
                                취소
                              </button>
                              <button
                                className="text-xs font-semibold transition-opacity hover:opacity-80"
                                style={{ color: STICKY_COLORS[stickyColor]?.header ?? "#f59e0b" }}
                                onClick={async () => {
                                  if (!pdfServerId) return;
                                  const updated = await updateAnnotation(
                                    pdfServerId,
                                    ann.id,
                                    stickyText,
                                    stickyColor,
                                  );
                                  if (updated) {
                                    setAnnotations((prev) =>
                                      prev.map((a) =>
                                        a.id === ann.id ? updated : a,
                                      ),
                                    );
                                  }
                                  setEditingSticky(null);
                                }}
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  {/* Pending new note — only on current page */}
                  {n === pageNumber && pendingSticky && (
                    <div
                      className="absolute z-20"
                      style={{
                        left: `${pendingSticky.xPct}%`,
                        top: `${pendingSticky.yPct}%`,
                        transform: "translate(-50%, 4px)",
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Windows Sticky Note style */}
                      <div
                        className="rounded-lg shadow-2xl overflow-hidden flex flex-col"
                        style={{ width: "220px", backgroundColor: STICKY_COLORS[stickyColor]?.body ?? "#fef9c3" }}
                      >
                        {/* Header bar */}
                        <div
                          className="flex items-center px-2 py-1.5 gap-1.5"
                          style={{ backgroundColor: STICKY_COLORS[stickyColor]?.header ?? "#f59e0b" }}
                        >
                          {["yellow", "pink", "green", "blue"].map((c) => (
                            <button
                              key={c}
                              onClick={() => setStickyColor(c)}
                              className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-110"
                              style={{
                                backgroundColor: STICKY_COLORS[c]?.body ?? "#fef9c3",
                                outline: stickyColor === c ? "2px solid white" : "none",
                                outlineOffset: "1px",
                              }}
                            />
                          ))}
                          <div className="flex-1" />
                          <button
                            className="text-white/80 hover:text-white transition-colors"
                            title="닫기"
                            onClick={() => setPendingSticky(null)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        {/* Body */}
                        <textarea
                          className="w-full text-sm p-2.5 resize-none focus:outline-none bg-transparent leading-relaxed"
                          rows={4}
                          placeholder="메모 입력..."
                          value={stickyText}
                          onChange={(e) => setStickyText(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setPendingSticky(null);
                          }}
                        />
                        {/* Footer */}
                        <div className="flex justify-end px-2 pb-2 gap-2">
                          <button
                            className="text-xs opacity-50 hover:opacity-80 transition-opacity"
                            onClick={() => setPendingSticky(null)}
                          >
                            취소
                          </button>
                          <button
                            className="text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-30"
                            style={{ color: STICKY_COLORS[stickyColor]?.header ?? "#f59e0b" }}
                            disabled={!stickyText.trim()}
                            onClick={async () => {
                              if (!pdfServerId || !stickyText.trim()) return;
                              const created = await createAnnotation(
                                pdfServerId,
                                pageNumber,
                                pendingSticky.xPct,
                                pendingSticky.yPct,
                                stickyText.trim(),
                                stickyColor,
                              );
                              if (created)
                                setAnnotations((prev) => [...prev, created]);
                              setPendingSticky(null);
                              setStickyText("");
                            }}
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Document>
        </div>

        {/* Spotlight-style search overlay — draggable */}
        {showSearch && (
          <div
            ref={spotlightRef}
            className="absolute z-20 w-[min(420px,90%)]"
            style={{ left: `${spotlightPos.x}%`, top: `${spotlightPos.y}%`, transform: "translateX(-50%)" }}
            onMouseLeave={() => { if (!spotlightDrag.current) { setShowSearch(false); setSearchQuery(""); setSearchResults([]); } }}
          >
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
              {/* Drag handle bar */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className="flex items-center justify-center py-1.5 cursor-move select-none"
                onMouseDown={(e) => {
                  e.preventDefault();
                  spotlightDrag.current = { startX: e.clientX, startY: e.clientY, origX: spotlightPos.x, origY: spotlightPos.y };
                }}
              >
                <div className="w-8 h-1 rounded-full bg-gray-300" />
              </div>
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 pb-3">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); setSearchResults([]); } }}
                  placeholder="페이지 내용 검색..."
                  className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-900"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Results */}
              {(isSearching || (searchQuery.trim() && searchResults.length >= 0)) && (
                <div className="border-t border-gray-100">
                  {isSearching && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 px-4 py-3">
                      <span className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                      전체 페이지 검색 중...
                    </div>
                  )}
                  {!isSearching && searchQuery.trim() && (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {searchResults.length === 0 ? (
                        <p className="text-xs text-gray-400 px-4 py-3">결과 없음</p>
                      ) : (
                        <>
                          <p className="text-[10px] text-gray-400 px-4 pt-1 pb-1">{searchResults.length}개 페이지 발견</p>
                          {searchResults.map((r) => (
                            <button
                              key={r.page}
                              onClick={() => { scrollToPage(r.page); }}
                              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-start gap-3 group"
                            >
                              <span className="text-xs font-semibold text-blue-600 shrink-0 mt-0.5 tabular-nums bg-blue-50 px-1.5 py-0.5 rounded">
                                p.{r.page}
                              </span>
                              <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 line-clamp-2">
                                <ExcerptHighlight text={r.excerpt} query={searchQuery.trim()} />
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating bottom toolbar */}
        {file && numPages > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1 py-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg text-sm text-gray-600 min-w-max">
            {/* Language selector */}
            <button
              onClick={() => { setPendingLang(null); setShowLangModal(true); }}
              title="학습 언어 선택"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                language
                  ? "hover:bg-gray-100"
                  : "text-amber-600 bg-amber-50 hover:bg-amber-100"
              }`}
            >
              {language ? (
                <>
                  <span className="text-sm leading-none">{TTS_LANGUAGES.find((l) => l.code === language)?.flag}</span>
                  <span>{TTS_LANGUAGES.find((l) => l.code === language)?.label}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                  </svg>
                  <span>언어</span>
                </>
              )}
            </button>
            {/* Search toggle */}
            <button
              onClick={() => { setShowSearch((v) => !v); }}
              title="내용 찾기 (⌘F)"
              className={`p-1.5 rounded-md transition-colors ${showSearch ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Zoom out */}
            <button
              onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.1).toFixed(1))))}
              title="축소"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            {/* Zoom percentage */}
            <button
              onClick={() => setScale(1.0)}
              title="맞춤 (1x)"
              className="px-1 py-0.5 rounded-md hover:bg-gray-100 transition-colors text-xs tabular-nums min-w-[36px] text-center"
            >
              {Math.round(scale * 100)}%
            </button>
            {/* Zoom in */}
            <button
              onClick={() => setScale((s) => Math.min(2.0, parseFloat((s + 0.1).toFixed(1))))}
              title="확대"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {/* Fit to width */}
            <button
              onClick={() => {
                const w = containerRef.current?.clientWidth ?? 600;
                setScale(Math.max(0.5, Math.min(2.0, parseFloat(((w - 32) / 760).toFixed(2)))));
              }}
              title="너비 맞춤"
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Prev page */}
            <button
              onClick={() => scrollToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              title="이전 페이지"
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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
                      if (!isNaN(n) && n >= 1 && n <= numPages) scrollToPage(n);
                      setPageInputStr(null);
                    } else if (e.key === "Escape") {
                      setPageInputStr(null);
                    }
                  }}
                  onBlur={() => {
                    const n = parseInt(pageInputStr ?? "", 10);
                    if (!isNaN(n) && n >= 1 && n <= numPages) scrollToPage(n);
                    setPageInputStr(null);
                  }}
                  className="w-8 text-center border border-blue-400 rounded focus:outline-none"
                />
              )}
              <span className="text-gray-400">/ {numPages}</span>
            </div>
            {/* Next page */}
            <button
              onClick={() => scrollToPage(pageNumber + 1)}
              disabled={pageNumber >= numPages}
              title="다음 페이지"
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {/* Note mode toggle — only when PDF is server-uploaded */}
            {pdfServerId && (
              <>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <button
                  onClick={() => { setIsStickyMode((v) => !v); setPendingSticky(null); }}
                  title={isStickyMode ? "스티키 메모 끄기" : "스티키 메모 추가"}
                  className={`p-1.5 rounded-md transition-colors ${isStickyMode ? "bg-yellow-100 text-yellow-700" : "hover:bg-gray-100"}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Selection popup */}
        {popup && (
          <div
            id="pdf-selection-popup"
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden flex flex-col-reverse"
            style={{
              left: Math.min(popup.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 160),
              ...(popup.y < 80
                ? { top: popup.y + 24 }
                : { bottom: typeof window !== "undefined" ? window.innerHeight - popup.y + 16 : 0 }),
              transform: "translateX(-50%)",
            }}
          >
            <div className="flex">
              {/* 소리 */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  setShowTtsPanel(true);
                  setPopupTranslation(null);
                }}
                onClick={() => {
                  if (!language) {
                    setPendingLang(null);
                    setShowLangModal(true);
                    return;
                  }
                  if (speakWithOptions) {
                    speakWithOptions(popup.text, {
                      volume: tempVolume,
                      rate: tempRate,
                    });
                  } else {
                    speak(popup.text);
                  }
                }}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all flex items-center gap-1.5"
                title={
                  language ? "소리 내어 읽기" : "학습 언어를 먼저 선택하세요"
                }
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
                  setShowTtsPanel(false);
                  setPopupTranslation(null);
                  navigator.clipboard.writeText(popup.text);
                  window.getSelection()?.removeAllRanges();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1000);
                }}
                className={`px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${copied ? "text-green-600 bg-green-50" : "text-gray-600 hover:bg-gray-50 active:bg-gray-200 active:scale-95"}`}
                title="클립보드에 복사"
              >
                {copied ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
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
                )}
                {copied ? "복사됨" : "복사"}
              </button>
              <div className="w-px bg-gray-200" />
              {/* 번역 */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setShowTtsPanel(false);
                  if (popupTranslation !== null) {
                    setPopupTranslation(null);
                    return;
                  }
                  setIsTranslating(true);
                  try {
                    const res = await fetch(
                      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(popup.text)}&langpair=${(language || "en-US").slice(0, 2)}|ko`,
                    );
                    const data = await res.json();
                    setPopupTranslation(
                      data?.responseData?.translatedText ?? "번역 실패",
                    );
                  } catch {
                    setPopupTranslation("번역 오류");
                  } finally {
                    setIsTranslating(false);
                  }
                }}
                disabled={isTranslating}
                className={`px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${popupTranslation !== null ? "bg-green-50 text-green-700" : "text-green-700 hover:bg-green-50 active:bg-green-100 active:scale-95"} disabled:opacity-60`}
                title="번역 (→ 한국어)"
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
                    d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                  />
                </svg>
                {isTranslating ? "..." : "번역"}
              </button>
              <div className="w-px bg-gray-200" />
              {/* 질문하기 */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  setShowTtsPanel(false);
                  onTextSelect({ text: popup.text, id: Date.now() });
                  setPopup(null);
                  setPopupTranslation(null);
                  setSelectionRects([]);
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
                  setShowTtsPanel(false);
                  setPracticePdfText(popup.text);
                  setPopup(null);
                  setPopupTranslation(null);
                  setSelectionRects([]);
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
            {/* TTS controls row (shown on 소리 button hover) */}
            {showTtsPanel && (
              <>
                <div className="h-px bg-gray-100" />
                <div className="px-3 py-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-3 h-3 text-gray-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    </svg>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={tempVolume}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setTempVolume(Number(e.target.value))}
                      className="flex-1 h-1 accent-gray-500"
                    />
                    <span className="text-[10px] text-gray-500 w-7 text-right">
                      {Math.round(tempVolume * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-3 h-3 text-gray-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={tempRate}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setTempRate(Number(e.target.value))}
                      className="flex-1 h-1 accent-gray-500"
                    />
                    <span className="text-[10px] text-gray-500 w-7 text-right">
                      {tempRate.toFixed(1)}x
                    </span>
                  </div>
                </div>
              </>
            )}
            {/* Translation result row */}
            {popupTranslation !== null && (
              <>
                <div className="h-px bg-gray-100" />
                <div className="px-3 py-2 flex items-start gap-2 max-w-xs">
                  <span className="text-[10px] text-green-600 font-semibold shrink-0 mt-0.5">
                    KO
                  </span>
                  <p className="text-xs text-gray-800 leading-relaxed">
                    {popupTranslation}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Pronunciation practice modal */}
        {practicePdfText && (
          <PronunciationModal
            key={practicePdfText}
            text={practicePdfText}
            speak={speak}
            lang={language ?? "en-US"}
            onClose={() => setPracticePdfText(null)}
          />
        )}

        {/* Language selection modal */}
        {showLangModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-80 p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-800">
                  학습 언어 선택
                </h2>
                {/* Only show close button if a language is already set */}
                {language && (
                  <button
                    onClick={() => setShowLangModal(false)}
                    className="p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors -mt-0.5 -mr-0.5"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {language
                  ? "선택한 언어로 발음(TTS)이 재생됩니다."
                  : "이 PDF의 학습 언어를 선택해주세요. TTS 발음과 번역에 사용됩니다."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TTS_LANGUAGES.map((lang) => {
                  const selected = (pendingLang ?? language) === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setPendingLang(lang.code)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <span className="text-xl leading-none">{lang.flag}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {lang.label}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {lang.name}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  const lang = pendingLang ?? language;
                  if (lang) {
                    onLanguageChange(lang);
                    if (pdfServerId)
                      savePdfLanguage(pdfServerId, lang).catch(() => {});
                  }
                  setPendingLang(null);
                  setShowLangModal(false);
                }}
                disabled={!pendingLang && !language}
                className="mt-4 w-full py-2 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                저장
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
