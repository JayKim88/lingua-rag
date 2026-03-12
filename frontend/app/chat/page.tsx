"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ChatPanel from "@/components/ChatPanel";
import SaveToPageModal, { type SaveResult } from "@/components/SaveToPageModal";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useTTS } from "@/hooks/useTTS";
import { createClient } from "@/lib/supabase/client";
import {
  getLibraryMeta,
  loadPdfFromLibrary,
  migratePdfKey,
  savePdfToLibrary,
  deletePdfFromLibrary,
  removeLibraryMeta,
  setLibraryMetaPdfServerId,
  setLibraryMetaFolderId,
  upsertLibraryMeta,
  updateLibraryIndexStatus,
  generateChatId,
  getSessionMeta,
  LIBRARY_META_KEY,
  LIBRARY_CURRENT_KEY,
  type PdfMeta,
} from "@/lib/pdfLibrary";
import {
  loadTree,
  saveTree,
  getDescendantIds,
  nextOrder,
  type TreeNode,
  type NodeType,
} from "@/lib/tree";
import SidebarTree, { PDF_DRAG_TYPE } from "@/components/SidebarTree";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
});

const PageViewer = dynamic(() => import("@/components/PageViewer"), {
  ssr: false,
});

const LANDING_FEATURES = [
  {
    emoji: "\u{1F4AC}",
    title: "교재 맥락 AI 채팅",
    desc: '"이 페이지 설명해줘" 한마디면 끝',
  },
  {
    emoji: "\u{1F3A4}",
    title: "발음 연습",
    desc: "따라 읽고 정확도를 바로 확인",
  },
  {
    emoji: "\u{1F4CC}",
    title: "메모 & 노트",
    desc: "PDF 위에 메모, AI 답변은 노트로 저장",
  },
  {
    emoji: "\u{1F4DD}",
    title: "자동 요약",
    desc: "어휘·문법·핵심 문장을 AI가 정리",
  },
];

const LANDING_LANGUAGES = [
  { flag: "\u{1F1E9}\u{1F1EA}", name: "Deutsch" },
  { flag: "\u{1F1FA}\u{1F1F8}", name: "English" },
  { flag: "\u{1F1EB}\u{1F1F7}", name: "Français" },
  { flag: "\u{1F1EA}\u{1F1F8}", name: "Español" },
  { flag: "\u{1F1EE}\u{1F1F9}", name: "Italiano" },
  { flag: "\u{1F1EF}\u{1F1F5}", name: "日本語" },
  { flag: "\u{1F1E8}\u{1F1F3}", name: "中文" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Português" },
];

const CHAT_MIN = 280;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 500;

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 280;

type ViewMode = "both" | "pdf" | "chat";

function ChatContent() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [visitedPdfs, setVisitedPdfs] = useState<Set<string>>(new Set());
  // pdfId is fixed at the moment a PDF is first visited — prevents mid-session drift
  const pdfIdMap = useRef<Map<string, string>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [modalLib, setModalLib] = useState<PdfMeta[]>([]);
  const [openFile, setOpenFile] = useState<File | null>(null);
  const [activePdfName, setActivePdfName] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pdfLibrary, setPdfLibrary] = useState<PdfMeta[]>([]);
  const [pdfServerId, setPdfServerId] = useState<string | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Folders / tree state
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedPageNode, setSelectedPageNode] = useState<TreeNode | null>(
    null,
  );

  // Save-to-page modal state
  const [showSaveToPageModal, setShowSaveToPageModal] = useState(false);
  const [saveToPageContent, setSaveToPageContent] = useState("");

  // PDF context menu + modals (all keyed by chatId)
  const [contextMenuPdf, setContextMenuPdf] = useState<string | null>(null); // chatId of PDF with open menu
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [confirmDeletePdf, setConfirmDeletePdf] = useState<string | null>(null); // chatId
  const [renamingPdf, setRenamingPdf] = useState<string | null>(null); // chatId of PDF being renamed
  const [renameValue, setRenameValue] = useState("");
  const [confirmResetPdf, setConfirmResetPdf] = useState<string | null>(null); // chatId
  const [isDraggingItem, setIsDraggingItem] = useState(false); // true when any PDF/node is being dragged
  const [chatResetKey, setChatResetKey] = useState(0); // increment to force ChatPanel remount

  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null,
  );
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // PDF text injection state — uses id to re-trigger same text
  const [injectText, setInjectText] = useState<
    { text: string; id: number } | undefined
  >();
  // PDF viewer ref for on-demand text extraction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfViewerRef = useRef<any>(null);
  const [hasPdfContext, setHasPdfContext] = useState(false);

  // Chat panel resize state (for "both" mode)
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT);
  const [isChatResizing, setIsChatResizing] = useState(false);
  const isChatResizingRef = useRef(false);
  const chatDragStartX = useRef(0);
  const chatDragStartWidth = useRef(0);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const isSidebarResizingRef = useRef(false);
  const sidebarDragStartX = useRef(0);
  const sidebarDragStartWidth = useRef(0);

  // Sidebar section split (Chats vs Folders) — percentage for Chats section
  const [chatsSplitPct, setChatsSplitPct] = useState(50);
  const isSplitResizing = useRef(false);
  const chatsSplitPctRef = useRef(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const healthStatus = useBackendHealth();
  const {
    speak,
    speakWithOptions,
    volume,
    setVolume,
    rate,
    setRate,
    language,
    setLanguage,
  } = useTTS();
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [draftVolume, setDraftVolume] = useState(volume);
  const [draftRate, setDraftRate] = useState(rate);

  // Account & language modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Drag-drop state (for landing content upload zone)
  const [isDragging, setIsDragging] = useState(false);
  const landingFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize from localStorage (run once on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedViewMode = localStorage.getItem(
      "lingua_view_mode",
    ) as ViewMode | null;
    if (
      savedViewMode === "both" ||
      savedViewMode === "pdf" ||
      savedViewMode === "chat"
    ) {
      setViewMode(savedViewMode);
    }

    const savedShowSidebar = localStorage.getItem("lingua_show_sidebar");
    if (savedShowSidebar !== null) {
      setShowSidebar(savedShowSidebar === "true");
    }

    // Load PDF library (sorted by registration order asc) and tree
    const library = getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt);
    setPdfLibrary(library);
    setTreeNodes(loadTree());

    // Restore last active PDF (PdfViewer restores the file itself via IDB)
    const lastChatId = localStorage.getItem(LIBRARY_CURRENT_KEY);
    // Support both chatId (new) and name (old) formats
    const lastMeta = lastChatId
      ? (library.find((m) => m.chatId === lastChatId) ??
        library.find((m) => m.name === lastChatId))
      : null;
    if (lastMeta) {
      // Migrate old name-based LIBRARY_CURRENT_KEY to chatId
      if (lastChatId !== lastMeta.chatId) {
        localStorage.setItem(LIBRARY_CURRENT_KEY, lastMeta.chatId!);
      }
      pdfIdMap.current.set(
        lastMeta.name,
        `${lastMeta.pdfServerId ?? lastMeta.name}`,
      );
      setActivePdfName(lastMeta.name);
      setActiveChatId(lastMeta.chatId ?? null);
      setVisitedPdfs(new Set([lastMeta.name]));
      if (!savedViewMode || savedViewMode === "chat") setViewMode("both");
    }

    // Restore sidebar split ratio
    const savedSplit = localStorage.getItem("lingua_sidebar_split");
    if (savedSplit) {
      const v = Number(savedSplit);
      setChatsSplitPct(v);
      chatsSplitPctRef.current = v;
    }

    setInitialized(true);

    // Transfer guest PDFs from sessionStorage to account (after login)
    const guestPdfs = getSessionMeta();
    if (guestPdfs.length > 0) {
      (async () => {
        for (const meta of guestPdfs) {
          try {
            const chatId = meta.chatId ?? generateChatId();
            let file = await loadPdfFromLibrary(chatId);
            // Migration: try old name-based key
            if (!file) file = await migratePdfKey(meta.name, chatId);
            if (!file) continue;

            // Ensure local metadata exists
            upsertLibraryMeta(file, chatId);
            savePdfToLibrary(file, chatId).catch(() => {});

            // Upload to server if not already uploaded
            if (!meta.pdfServerId) {
              const formData = new FormData();
              formData.append("file", file);
              const res = await fetch("/api/pdfs", {
                method: "POST",
                body: formData,
              });
              if (res.ok) {
                const data = await res.json();
                if (data?.id) {
                  setLibraryMetaPdfServerId(chatId, data.id);
                }
              }
            }
          } catch (err) {
            console.warn("Guest PDF transfer failed:", meta.name, err);
          }
        }
        // Clear guest session data
        sessionStorage.removeItem("guest-tab-pdfs");
        setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
      })();
    }

    // Async: fetch server PDF list and merge with localStorage
    fetch("/api/pdfs")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          serverPdfs: Array<{
            id: string;
            name: string;
            size: number;
            created_at: number;
            index_status?: string;
          }>,
        ) => {
          if (!serverPdfs.length) return;
          const local = getLibraryMeta();
          const localByName = new Map(local.map((m) => [m.name, m]));
          let changed = false;
          const toAdd: PdfMeta[] = [];

          for (const sp of serverPdfs) {
            const existing = localByName.get(sp.name);
            if (existing) {
              if (!existing.pdfServerId && existing.chatId) {
                setLibraryMetaPdfServerId(existing.chatId, sp.id);
                changed = true;
              }
            } else {
              toAdd.push({
                name: sp.name,
                size: sp.size,
                lastOpened: new Date(sp.created_at * 1000).toISOString(),
                addedAt: sp.created_at * 1000,
                pdfServerId: sp.id,
                indexStatus:
                  (sp.index_status as PdfMeta["indexStatus"]) ?? "pending",
                chatId: generateChatId(),
              });
              changed = true;
            }
          }

          if (toAdd.length > 0) {
            const merged = [...getLibraryMeta(), ...toAdd];
            localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(merged));
          }

          if (changed) {
            setPdfLibrary(
              getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt),
            );
          }

          // Update indexStatus for all existing PDFs from server & persist to localStorage
          const statusByName = new Map(
            serverPdfs.map((sp) => [sp.name, sp.index_status ?? "pending"]),
          );
          setPdfLibrary((prev) =>
            prev.map((m) => {
              const serverStatus = statusByName.get(m.name);
              if (serverStatus && serverStatus !== m.indexStatus && m.chatId) {
                updateLibraryIndexStatus(
                  m.chatId,
                  serverStatus as NonNullable<PdfMeta["indexStatus"]>,
                );
                return {
                  ...m,
                  indexStatus: serverStatus as PdfMeta["indexStatus"],
                };
              }
              return m;
            }),
          );

          // Auto-trigger indexing for existing PDFs that were uploaded before indexing existed
          for (const sp of serverPdfs) {
            if (!sp.index_status || sp.index_status === "pending") {
              fetch(`/api/pdfs/${sp.id}/index`, { method: "POST" }).catch(
                () => {},
              );
            }
          }
        },
      )
      .catch(() => {});
  }, []);

  // Refresh PDF library when a new file is opened
  useEffect(() => {
    if (!initialized) return;
    // Small delay to let PdfViewer save the file to library first
    const t = setTimeout(
      () =>
        setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt)),
      300,
    );
    return () => clearTimeout(t);
  }, [openFile, initialized]);

  // Poll index_status for PDFs that are pending/indexing
  const pollingNeeded = pdfLibrary.some(
    (m) =>
      m.pdfServerId &&
      (m.indexStatus === "pending" || m.indexStatus === "indexing"),
  );

  useEffect(() => {
    if (!pollingNeeded) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/pdfs");
        if (!res.ok) return;
        const serverPdfs: Array<{
          id: string;
          name: string;
          index_status?: string;
        }> = await res.json();
        const statusMap2 = new Map(
          serverPdfs.map((sp) => [sp.name, sp.index_status ?? "pending"]),
        );
        // Re-read from localStorage to pick up entries added since last render
        const fresh = getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt);
        let changed = false;
        const next = fresh.map((m) => {
          const s = statusMap2.get(m.name);
          if (s && s !== m.indexStatus && m.chatId) {
            updateLibraryIndexStatus(
              m.chatId,
              s as NonNullable<PdfMeta["indexStatus"]>,
            );
            changed = true;
            return { ...m, indexStatus: s as PdfMeta["indexStatus"] };
          }
          return m;
        });
        setPdfLibrary((prev) => {
          // Update if status changed or entry count differs (new PDF added)
          if (changed || prev.length !== next.length) return next;
          return prev;
        });
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pollingNeeded]);

  // Fetch user info
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          name:
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "User",
          email: user.email ?? "",
        });
      }
    });
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuPdf) return;
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenuPdf(null);
        setContextMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenuPdf]);

  // Persist to localStorage on viewMode/showSidebar change
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem("lingua_view_mode", viewMode);
    localStorage.setItem("lingua_show_sidebar", String(showSidebar));
  }, [viewMode, showSidebar, initialized]);

  // Sidebar drag-to-resize (drag from right edge of sidebar)
  const onSidebarDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isSidebarResizingRef.current = true;
      setIsSidebarResizing(true);
      sidebarDragStartX.current = e.clientX;
      sidebarDragStartWidth.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  // Chat panel drag-to-resize (drag from left edge of chat panel)
  const onChatDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isChatResizingRef.current = true;
      setIsChatResizing(true);
      chatDragStartX.current = e.clientX;
      chatDragStartWidth.current = chatWidth;
    },
    [chatWidth],
  );

  // Split divider drag handler (Chats / Folders vertical split)
  const onSplitDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isSplitResizing.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isChatResizingRef.current) {
        const delta = chatDragStartX.current - e.clientX;
        const next = Math.max(
          CHAT_MIN,
          Math.min(CHAT_MAX, chatDragStartWidth.current + delta),
        );
        setChatWidth(next);
      }
      if (isSidebarResizingRef.current) {
        const delta = e.clientX - sidebarDragStartX.current;
        const next = Math.max(
          SIDEBAR_MIN,
          Math.min(SIDEBAR_MAX, sidebarDragStartWidth.current + delta),
        );
        setSidebarWidth(next);
      }
      if (isSplitResizing.current && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        const clamped = Math.max(20, Math.min(80, pct));
        setChatsSplitPct(clamped);
        chatsSplitPctRef.current = clamped;
      }
    };
    const onMouseUp = () => {
      if (isChatResizingRef.current) {
        isChatResizingRef.current = false;
        setIsChatResizing(false);
      }
      if (isSidebarResizingRef.current) {
        isSidebarResizingRef.current = false;
        setIsSidebarResizing(false);
      }
      if (isSplitResizing.current) {
        isSplitResizing.current = false;
        localStorage.setItem(
          "lingua_sidebar_split",
          String(chatsSplitPctRef.current),
        );
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Tree handlers ────────────────────────────────────────────────────────

  const handleAddNode = useCallback(
    (parentId: string | null, type: NodeType) => {
      const newNode: TreeNode = {
        id: crypto.randomUUID(),
        type,
        name: type === "folder" ? "새 폴더" : "새 페이지",
        parentId,
        order: nextOrder(treeNodes, parentId),
        createdAt: Date.now(),
      };
      const next = [...treeNodes, newNode];
      setTreeNodes(next);
      saveTree(next);
    },
    [treeNodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const idsToRemove = getDescendantIds(treeNodes, nodeId);
      const next = treeNodes.filter((n) => !idsToRemove.includes(n.id));
      setTreeNodes(next);
      saveTree(next);
      setSelectedPageNode((prev) =>
        prev && idsToRemove.includes(prev.id) ? null : prev,
      );
      // Unlink PDFs from deleted folders so they reappear in Chats
      const removedSet = new Set(idsToRemove);
      const lib = getLibraryMeta();
      let changed = false;
      const updatedLib = lib.map((m) => {
        if (m.folderId && removedSet.has(m.folderId)) {
          changed = true;
          return { ...m, folderId: null };
        }
        return m;
      });
      if (changed) {
        localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updatedLib));
        setPdfLibrary(updatedLib.sort((a, b) => a.addedAt - b.addedAt));
      }
    },
    [treeNodes],
  );

  const handleMoveNode = useCallback(
    (nodeId: string, newParentId: string | null) => {
      setTreeNodes((prev) => {
        const updated = prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                parentId: newParentId,
                order: nextOrder(prev, newParentId),
              }
            : n,
        );
        saveTree(updated);
        return updated;
      });
    },
    [],
  );

  const handleRenameNode = useCallback((nodeId: string, newName: string) => {
    setTreeNodes((prev) => {
      const updated = prev.map((n) =>
        n.id === nodeId ? { ...n, name: newName, updatedAt: Date.now() } : n,
      );
      saveTree(updated);
      return updated;
    });
  }, []);

  // Rename PDF directly (used by folder PDF context menu)
  const handleRenamePdfDirect = useCallback(
    (chatId: string, newName: string) => {
      const meta = pdfLibrary.find((m) => m.chatId === chatId);
      if (!meta) return;
      const raw: PdfMeta[] = JSON.parse(
        localStorage.getItem(LIBRARY_META_KEY) ?? "[]",
      );
      const updated = raw.map((m) =>
        m.chatId === chatId ? { ...m, name: newName } : m,
      );
      localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
      setPdfLibrary(updated.sort((a, b) => a.addedAt - b.addedAt));

      const oldPdfId = pdfIdMap.current.get(meta.name);
      if (oldPdfId) {
        pdfIdMap.current.delete(meta.name);
        pdfIdMap.current.set(newName, oldPdfId);
      }
      if (activePdfName === meta.name) setActivePdfName(newName);
      setVisitedPdfs((prev) => {
        if (!prev.has(meta.name)) return prev;
        const s = new Set(prev);
        s.delete(meta.name);
        s.add(newName);
        return s;
      });
    },
    [pdfLibrary, activePdfName],
  );

  const handleSelectNode = useCallback((node: TreeNode) => {
    if (node.type === "page") setSelectedPageNode(node);
  }, []);

  const handleUpdateNode = useCallback(
    (nodeId: string, changes: { name?: string; content?: string }) => {
      const next = treeNodes.map((n) =>
        n.id === nodeId ? { ...n, ...changes, updatedAt: Date.now() } : n,
      );
      setTreeNodes(next);
      saveTree(next);
      setSelectedPageNode((prev) =>
        prev?.id === nodeId
          ? (next.find((n) => n.id === nodeId) ?? null)
          : prev,
      );
    },
    [treeNodes],
  );

  const handleSaveToPage = useCallback(
    (result: SaveResult) => {
      const now = Date.now();
      let next = [...treeNodes];
      if (result.mode === "new-folder-page") {
        const folderId = crypto.randomUUID();
        const pageId = crypto.randomUUID();
        next = [
          ...next,
          {
            id: folderId,
            type: "folder" as const,
            name: result.folderName,
            parentId: null,
            order: nextOrder(next, null),
            createdAt: now,
          },
          {
            id: pageId,
            type: "page" as const,
            name: result.pageName,
            parentId: folderId,
            order: 0,
            createdAt: now,
            content: saveToPageContent,
            updatedAt: now,
          },
        ];
      } else if (result.mode === "new-page") {
        const pageId = crypto.randomUUID();
        next = [
          ...next,
          {
            id: pageId,
            type: "page" as const,
            name: result.pageName,
            parentId: result.parentId,
            order: nextOrder(next, result.parentId),
            createdAt: now,
            content: saveToPageContent,
            updatedAt: now,
          },
        ];
      } else {
        const target = next.find((n) => n.id === result.nodeId);
        if (target) {
          const appended = (target.content ?? "") + "\n\n" + saveToPageContent;
          next = next.map((n) =>
            n.id === result.nodeId
              ? { ...n, content: appended, updatedAt: now }
              : n,
          );
          setSelectedPageNode((prev) =>
            prev?.id === result.nodeId
              ? (next.find((n) => n.id === result.nodeId) ?? null)
              : prev,
          );
        }
      }
      setTreeNodes(next);
      saveTree(next);
      setShowSaveToPageModal(false);
      setSaveToPageContent("");
    },
    [treeNodes, saveToPageContent],
  );

  const handleOpenSaveToPage = useCallback((content: string) => {
    setSaveToPageContent(content);
    setShowSaveToPageModal(true);
  }, []);

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const newNode: TreeNode = {
      id: crypto.randomUUID(),
      type: "folder",
      name,
      parentId: null,
      order: nextOrder(treeNodes, null),
      createdAt: Date.now(),
    };
    const next = [...treeNodes, newNode];
    setTreeNodes(next);
    saveTree(next);
    setNewFolderName("");
    setShowNewFolderModal(false);
  };

  // ── Landing file upload (when no PDF is selected) ────────────────────────

  const handleLandingFileSelect = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") return;
    const chatId = generateChatId();
    upsertLibraryMeta(file, chatId);
    savePdfToLibrary(file, chatId).catch(() => {});
    localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);

    // Upload to server
    const formData = new FormData();
    formData.append("file", file);
    fetch("/api/pdfs", { method: "POST", body: formData })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) {
          setLibraryMetaPdfServerId(chatId, data.id);
          updateLibraryIndexStatus(
            chatId,
            (data.index_status as NonNullable<PdfMeta["indexStatus"]>) ??
              "pending",
          );
          pdfIdMap.current.set(file.name, data.id);
          setPdfServerId(data.id);
          setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
        }
      })
      .catch(() => {});

    // Open the PDF immediately
    if (!pdfIdMap.current.has(file.name)) {
      pdfIdMap.current.set(file.name, file.name);
    }
    setOpenFile(file);
    setActivePdfName(file.name);
    setActiveChatId(chatId);
    setSelectedPageNode(null);
    setViewMode("both");
    setVisitedPdfs((prev) => new Set([...prev, file.name]));
    setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
  }, []);

  const handleLandingDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleLandingFileSelect(file);
    },
    [handleLandingFileSelect],
  );

  const handleLandingDragOver = useCallback((e: React.DragEvent) => {
    // Only show overlay for external file drags, not internal PDF-to-folder drags
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleLandingDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const initials =
    user?.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleSelectPdf = async (meta: PdfMeta) => {
    // Ensure chatId exists
    const chatId = meta.chatId ?? generateChatId();
    if (!meta.chatId) {
      upsertLibraryMeta(new File([], meta.name), chatId);
      setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
    }

    // Try IDB first (fast, offline)
    let f = await loadPdfFromLibrary(chatId);
    // Migration: try old name-based key
    if (!f) f = await migratePdfKey(meta.name, chatId);

    // Fallback: fetch from server if not in IDB
    if (!f && meta.pdfServerId) {
      try {
        const res = await fetch(`/api/pdfs/${meta.pdfServerId}/file`);
        if (res.ok) {
          const blob = await res.blob();
          f = new File([blob], meta.name, { type: "application/pdf" });
          savePdfToLibrary(f, chatId).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }

    if (!f) return;
    if (!pdfIdMap.current.has(meta.name)) {
      pdfIdMap.current.set(meta.name, `${meta.pdfServerId ?? meta.name}`);
    }
    setOpenFile(f);
    setActivePdfName(meta.name);
    setActiveChatId(chatId);
    setSelectedPageNode(null);
    setViewMode("both");
    setVisitedPdfs((prev) => new Set([...prev, meta.name]));
    localStorage.setItem(LIBRARY_CURRENT_KEY, chatId);
  };

  const handleDeletePdf = async (chatId: string) => {
    const meta = pdfLibrary.find((m) => m.chatId === chatId);

    // Local cleanup
    await deletePdfFromLibrary(chatId);
    const updated = removeLibraryMeta(chatId);
    setPdfLibrary(updated.sort((a, b) => a.addedAt - b.addedAt));

    // Server cleanup (fire-and-forget)
    if (meta?.pdfServerId) {
      fetch(`/api/pdfs/${meta.pdfServerId}`, { method: "DELETE" }).catch(
        () => {},
      );
    }

    if (meta && activeChatId === chatId) {
      const sorted = updated.sort((a, b) => a.addedAt - b.addedAt);
      if (sorted.length > 0) {
        handleSelectPdf(sorted[0]);
      } else {
        setActivePdfName(null);
        setActiveChatId(null);
        setOpenFile(null);
        setViewMode("chat");
        localStorage.removeItem(LIBRARY_CURRENT_KEY);
      }
    }
    if (meta) {
      setVisitedPdfs((prev) => {
        const s = new Set(prev);
        s.delete(meta.name);
        return s;
      });
    }
    setConfirmDeletePdf(null);
  };

  const handleRenamePdf = (chatId: string) => {
    const meta = pdfLibrary.find((m) => m.chatId === chatId);
    if (!meta) return;
    const newName = renameValue.trim();
    if (!newName || newName === meta.name) {
      setRenamingPdf(null);
      return;
    }
    // Update localStorage metadata
    const raw: PdfMeta[] = JSON.parse(
      localStorage.getItem(LIBRARY_META_KEY) ?? "[]",
    );
    const updated = raw.map((m) =>
      m.chatId === chatId ? { ...m, name: newName } : m,
    );
    localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
    setPdfLibrary(updated.sort((a, b) => a.addedAt - b.addedAt));

    // Update pdfIdMap key if this PDF was visited
    const oldPdfId = pdfIdMap.current.get(meta.name);
    if (oldPdfId) {
      pdfIdMap.current.delete(meta.name);
      pdfIdMap.current.set(newName, oldPdfId);
    }

    // Update activePdfName if this is the active PDF
    if (activeChatId === meta.chatId) {
      setActivePdfName(newName);
    }

    // Update visitedPdfs
    setVisitedPdfs((prev) => {
      if (!prev.has(meta.name)) return prev;
      const s = new Set(prev);
      s.delete(meta.name);
      s.add(newName);
      return s;
    });

    setRenamingPdf(null);
  };

  const handleResetChat = async (chatId: string) => {
    const meta = pdfLibrary.find((m) => m.chatId === chatId);
    if (!meta?.pdfServerId) {
      setConfirmResetPdf(null);
      return;
    }
    try {
      // Find conversation by pdf_id
      const convsRes = await fetch("/api/conversations");
      if (!convsRes.ok) return;
      const { conversations } = await convsRes.json();
      const conv = (conversations ?? []).find(
        (c: { pdf_id: string }) => c.pdf_id === meta.pdfServerId,
      );
      if (conv) {
        await fetch(`/api/conversations/${conv.id}/messages`, {
          method: "DELETE",
        });
      }
    } catch {
      /* ignore */
    }

    // Force ChatPanel remount to clear local messages
    setChatResetKey((k) => k + 1);
    // Remove from visitedPdfs and re-add to force fresh mount
    if (meta) {
      setVisitedPdfs((prev) => {
        const s = new Set(prev);
        s.delete(meta.name);
        return s;
      });
      // Re-add after a tick so ChatPanel remounts fresh
      setTimeout(() => {
        setVisitedPdfs((prev) => new Set([...prev, meta.name]));
      }, 0);
    }
    setConfirmResetPdf(null);
  };

  const handleDropPdfToFolder = (chatId: string, folderId: string) => {
    setLibraryMetaFolderId(chatId, folderId);
    setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
  };

  const handleRemovePdfFromFolder = (chatId: string) => {
    setLibraryMetaFolderId(chatId, null);
    setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
  };

  const ungroupedPdfs = pdfLibrary.filter((m) => !m.folderId);

  const showPdf =
    (viewMode === "pdf" || viewMode === "both") && !selectedPageNode;
  const showChat = viewMode === "chat" || viewMode === "both";

  return (
    <div
      className={`flex h-screen bg-gray-50 flex-col${isChatResizing || isSidebarResizing ? " select-none cursor-col-resize" : ""}`}
      onDragOver={handleLandingDragOver}
      onDragLeave={handleLandingDragLeave}
      onDrop={handleLandingDrop}
    >
      {/* Cold start banner */}
      {(healthStatus === "warming" || healthStatus === "error") && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {healthStatus === "warming"
            ? "서버가 시작 중입니다. 첫 응답까지 30~60초가 걸릴 수 있습니다."
            : "서버에 연결할 수 없습니다. 잠시 후 새로고침 해주세요."}
        </div>
      )}

      {/* Global top header */}
      <header
        className="flex items-center justify-between h-11 px-3 border-b border-gray-200 bg-white shrink-0 z-30"
        style={{ boxShadow: "0 4px 6px 0 rgba(0,0,0,0.04)" }}
      >
        {/* Left */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setActivePdfName(null);
              setActiveChatId(null);
              setOpenFile(null);
              setSelectedPageNode(null);
              setViewMode("chat");
              localStorage.removeItem(LIBRARY_CURRENT_KEY);
            }}
            className="font-bold text-sm text-gray-900 me-1 hover:text-blue-600 transition-colors"
          >
            LinguaRAG
          </button>
          <button
            onClick={() => setShowSidebar((v) => !v)}
            title="사이드바 열고 닫기"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
            </svg>
          </button>
          <button
            onClick={() => {
              setModalLib(getLibraryMeta());
              setShowPdfModal(true);
            }}
            className="flex items-center gap-1 border border-gray-300 rounded-md px-2 h-8 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
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
            New
          </button>
        </div>

        {/* Center — current document/unit name */}
        <div className="flex-1 flex justify-center min-w-0 px-4">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
            {selectedPageNode
              ? selectedPageNode.name
              : (activePdfName ?? "PDF를 선택하세요")}
          </span>
        </div>

        {/* Right — view toggle + user */}
        <div className="flex items-center gap-1 shrink-0">
          {/* PDF only */}
          <button
            onClick={() => {
              setViewMode("pdf");
              setSelectedPageNode(null);
            }}
            title="PDF만 보기"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "pdf" && !selectedPageNode
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:bg-gray-100"
            }`}
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </button>
          {/* Both */}
          <button
            onClick={() => {
              setViewMode("both");
              setSelectedPageNode(null);
            }}
            title="PDF + 채팅"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "both" && !selectedPageNode
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" />
            </svg>
          </button>
          {/* Chat only */}
          <button
            onClick={() => {
              setViewMode("chat");
              setSelectedPageNode(null);
            }}
            title="채팅만 보기"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "chat" && !selectedPageNode
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:bg-gray-100"
            }`}
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
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
              />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* User button */}
          <div ref={userMenuRef} className="relative">
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 w-48 p-1">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowAccountModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="10" r="3" />
                    <path d="M7 20.662V19a2 2 0 012-2h6a2 2 0 012 2v1.662" />
                  </svg>
                  Account
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowLanguageModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="m5 8 6 6" />
                    <path d="m4 14 6-6 2-3" />
                    <path d="M2 5h12" />
                    <path d="M7 2h1" />
                    <path d="m22 22-5-10-5 10" />
                    <path d="M14 18h6" />
                  </svg>
                  Language
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setDraftVolume(volume);
                    setDraftRate(rate);
                    setShowSoundModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                  Sound
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    window.open("mailto:support@linguarag.com", "_blank");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M16 2v2" />
                    <path d="M7 22v-2a2 2 0 012-2h6a2 2 0 012 2v2" />
                    <path d="M8 2v2" />
                    <circle cx="12" cy="11" r="3" />
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                  </svg>
                  Contact support
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="m16 17 5-5-5-5" />
                    <path d="M21 12H9" />
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center hover:bg-blue-600 transition-colors"
              title={user?.name ?? "계정"}
            >
              {initials}
            </button>
          </div>
        </div>
      </header>

      {/* Hidden file input for landing upload */}
      <input
        ref={landingFileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLandingFileSelect(f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — resizable, collapsible */}
        {showSidebar && (
          <aside
            className="bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 overflow-hidden relative"
            style={{ width: sidebarWidth }}
          >
            {/* ── Chats + Folders split container ── */}
            <div
              ref={splitContainerRef}
              className="flex-1 flex flex-col overflow-hidden min-h-0"
            >
              {/* ── Chats section ── */}
              <div
                className="px-1.5 py-2 overflow-hidden flex flex-col min-h-0"
                style={{ height: `${chatsSplitPct}%` }}
              >
                <div className="flex items-center gap-1 px-1.5 py-1 text-sm text-gray-700 font-medium shrink-0">
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                    />
                  </svg>
                  Chats
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 space-y-0.5">
                  {ungroupedPdfs.length === 0 ? (
                    <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                      PDF를 추가해보세요
                    </p>
                  ) : (
                    ungroupedPdfs.map((meta) => (
                      <div
                        key={meta.chatId ?? meta.name}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(PDF_DRAG_TYPE, meta.chatId!);
                          e.dataTransfer.effectAllowed = "move";
                          setIsDraggingItem(true);
                        }}
                        onDragEnd={() => setIsDraggingItem(false)}
                        className={`group flex items-center rounded-md transition-colors cursor-grab active:cursor-grabbing ${
                          activeChatId === meta.chatId
                            ? "bg-gray-200"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <button
                          onClick={() => handleSelectPdf(meta)}
                          className={`flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1.5 text-xs truncate ${
                            activeChatId === meta.chatId
                              ? "text-gray-900 font-medium"
                              : "text-gray-500 group-hover:text-gray-800"
                          }`}
                        >
                          <span className="relative shrink-0 group/dot">
                            <svg
                              className="w-3 h-3 text-red-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
                            </svg>
                            {meta.pdfServerId &&
                              (meta.indexStatus === "pending" ||
                                meta.indexStatus === "indexing") && (
                                <>
                                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border border-white rounded-full bg-amber-400 animate-pulse" />
                                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover/dot:opacity-100 z-50">
                                    AI 분석 중...
                                  </span>
                                </>
                              )}
                            {meta.indexStatus === "ready" && (
                              <>
                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border border-white rounded-full bg-green-400" />
                                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover/dot:opacity-100 z-50">
                                  AI 분석 완료
                                </span>
                              </>
                            )}
                            {meta.indexStatus === "failed" && (
                              <>
                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border border-white rounded-full bg-red-400" />
                                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover/dot:opacity-100 z-50">
                                  AI 분석 실패
                                </span>
                              </>
                            )}
                          </span>
                          {renamingPdf === meta.chatId ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => handleRenamePdf(meta.chatId!)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleRenamePdf(meta.chatId!);
                                if (e.key === "Escape") setRenamingPdf(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate bg-white border border-blue-400 rounded px-1 py-0 text-xs text-gray-900 outline-none w-full"
                            />
                          ) : (
                            <span className="truncate">{meta.name}</span>
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              setContextMenuPdf((prev) =>
                                prev === meta.chatId ? null : meta.chatId!,
                              );
                              setContextMenuPos({
                                x: rect.left,
                                y: rect.bottom + 4,
                              });
                            }}
                            title="더보기"
                            className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all shrink-0"
                          >
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 16 16"
                              fill="currentColor"
                            >
                              <circle cx="8" cy="3" r="1.5" />
                              <circle cx="8" cy="8" r="1.5" />
                              <circle cx="8" cy="13" r="1.5" />
                            </svg>
                          </button>
                          {contextMenuPdf === meta.chatId && contextMenuPos && (
                            <div
                              ref={contextMenuRef}
                              className="fixed z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-xs"
                              style={{
                                left: contextMenuPos.x,
                                top: contextMenuPos.y,
                              }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenameValue(meta.name);
                                  setRenamingPdf(meta.chatId!);
                                  setContextMenuPdf(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
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
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                                이름 변경
                              </button>
                              <div className="h-px bg-gray-100 my-1" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmResetPdf(meta.chatId!);
                                  setContextMenuPdf(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
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
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                                채팅 초기화
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeletePdf(meta.chatId!);
                                  setContextMenuPdf(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ── Draggable divider ── */}
              <div
                onMouseDown={onSplitDividerMouseDown}
                className="shrink-0 cursor-row-resize mx-2 py-1.5"
              >
                <div className="h-px bg-gray-200" />
              </div>

              {/* ── Folders section ── */}
              <div
                className="px-1.5 py-2 overflow-hidden flex flex-col min-h-0"
                style={{ height: `${100 - chatsSplitPct}%` }}
              >
                <div className="flex items-center justify-between px-1.5 py-1 shrink-0">
                  <div className="flex items-center gap-1 text-sm text-gray-700 font-medium">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                      />
                    </svg>
                    Folders
                  </div>
                  <button
                    onClick={() => {
                      setNewFolderName("");
                      setShowNewFolderModal(true);
                    }}
                    title="새 폴더 만들기"
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                  {treeNodes.length === 0 ? (
                    <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                      폴더를 만들어
                      <br />
                      파일을 정리해보세요
                    </p>
                  ) : (
                    <SidebarTree
                      nodes={treeNodes}
                      selectedNodeId={selectedPageNode?.id ?? null}
                      onSelect={handleSelectNode}
                      onAddNode={handleAddNode}
                      onDelete={handleDeleteNode}
                      onMoveNode={handleMoveNode}
                      onRenameNode={handleRenameNode}
                      pdfLibrary={pdfLibrary}
                      activePdfName={activePdfName}
                      isDraggingItem={isDraggingItem}
                      onDragActiveChange={setIsDraggingItem}
                      onSelectPdf={handleSelectPdf}
                      onDropPdf={handleDropPdfToFolder}
                      onRemoveFromFolder={handleRemovePdfFromFolder}
                      onRenamePdf={handleRenamePdfDirect}
                      onResetPdf={(chatId) => setConfirmResetPdf(chatId)}
                      onDeletePdf={(chatId) => setConfirmDeletePdf(chatId)}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* end split container */}

            {/* Bottom: user account */}
            <div className="pb-3 px-2 border-t border-gray-200 shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <span className="text-xs text-gray-700 truncate flex-1 text-left">
                    {user?.name ?? "…"}
                  </span>
                </button>
              </div>
            </div>

            {/* Sidebar resize handle */}
            <div
              onMouseDown={onSidebarDragHandleMouseDown}
              onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
              className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors ${
                isSidebarResizing ? "bg-blue-400" : "hover:bg-blue-300"
              }`}
            />
          </aside>
        )}

        {/* ── Loading state ── */}
        {!initialized ? (
          <main className="flex-1 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">불러오는 중...</p>
            </div>
          </main>
        ) : /* ── Landing content (no PDF selected) ── */
        !activePdfName && !selectedPageNode ? (
          <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
            <div className="flex-1 overflow-y-auto">
              {/* Upload drop zone */}
              <div className="flex flex-col items-center justify-center px-6 pt-16 pb-10">
                <div className="mb-6">
                  <span className="text-5xl">{"\u{1F4DA}"}</span>
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
                  onClick={() => landingFileInputRef.current?.click()}
                  className={`w-full max-w-md flex flex-col items-center gap-3 px-6 py-10 rounded-2xl border-2 border-dashed transition-all group cursor-pointer ${
                    isDragging
                      ? "border-blue-500 bg-blue-50/70 scale-[1.02]"
                      : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/50"
                  }`}
                >
                  <svg
                    className={`w-10 h-10 transition-colors ${
                      isDragging
                        ? "text-blue-500"
                        : "text-gray-300 group-hover:text-blue-400"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <span
                    className={`text-sm font-medium transition-colors ${
                      isDragging
                        ? "text-blue-600"
                        : "text-gray-500 group-hover:text-blue-600"
                    }`}
                  >
                    {isDragging ? "여기에 놓으세요" : "PDF 파일을 업로드하세요"}
                  </span>
                  <span className="text-xs text-gray-400">
                    드래그 앤 드롭 또는 클릭하여 선택
                  </span>
                </button>
              </div>

              {/* Language bar */}
              <div className="flex items-center justify-center gap-4 flex-wrap px-6 py-4 border-y border-gray-100 bg-gray-50/50 mx-6 rounded-xl mb-8">
                {LANDING_LANGUAGES.map((lang) => (
                  <div
                    key={lang.name}
                    className="flex items-center gap-1 text-gray-500"
                  >
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
                      <span className="bg-yellow-200/70 px-0.5 rounded">
                        bitte
                      </span>
                      .
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { icon: "\u{1F50A}", label: "소리" },
                        { icon: "\u{1F4CB}", label: "복사" },
                        { icon: "\u{1F310}", label: "번역" },
                        { icon: "\u{1F4AC}", label: "질문" },
                        { icon: "\u{1F3A4}", label: "연습" },
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
                  {LANDING_FEATURES.map((f) => (
                    <div
                      key={f.title}
                      className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                    >
                      <span className="text-xl mb-2 block">{f.emoji}</span>
                      <h3 className="text-xs font-semibold text-gray-800 mb-0.5">
                        {f.title}
                      </h3>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        ) : (
          <>
            {/* Page viewer (replaces PDF area when a page is selected) */}
            {selectedPageNode && (
              <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0">
                  <button
                    onClick={() => setSelectedPageNode(null)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
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
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    뒤로
                  </button>
                </div>
                {initialized && (
                  <PageViewer
                    node={selectedPageNode}
                    onUpdate={handleUpdateNode}
                  />
                )}
              </main>
            )}

            {/* PDF viewer area */}
            {showPdf && (
              <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                {initialized && (
                  <PdfViewer
                    ref={pdfViewerRef}
                    onTextSelect={setInjectText}
                    onPageChange={() => setHasPdfContext(true)}
                    speak={speak}
                    speakWithOptions={speakWithOptions}
                    language={language}
                    onLanguageChange={setLanguage}
                    openFile={openFile}
                    onClose={() => setViewMode("chat")}
                    pdfServerId={pdfServerId}
                  />
                )}
              </main>
            )}

            {/* PDF↔Chat drag handle — only in "both" mode with no page selected */}
            {viewMode === "both" && !selectedPageNode && (
              <div
                onMouseDown={onChatDragHandleMouseDown}
                onDoubleClick={() => setChatWidth(CHAT_DEFAULT)}
                className={`w-1 shrink-0 cursor-col-resize transition-colors ${
                  isChatResizing
                    ? "bg-blue-400"
                    : "bg-gray-200 hover:bg-blue-300"
                }`}
              />
            )}

            {/* Chat panel */}
            {showChat && (
              <section
                className={`flex flex-col overflow-hidden bg-white${viewMode === "both" && !selectedPageNode ? " shrink-0" : " flex-1"}`}
                style={
                  viewMode === "both" && !selectedPageNode
                    ? { width: chatWidth }
                    : undefined
                }
              >
                {/* Persistent chat panels — one per visited PDF */}
                {initialized &&
                  [...visitedPdfs].map((pdfName) => {
                    const pdfId = pdfIdMap.current.get(pdfName) ?? pdfName;
                    return (
                      <div
                        key={`${pdfName}-${chatResetKey}`}
                        className="flex-1 flex flex-col overflow-hidden"
                        style={{
                          display:
                            pdfName === activePdfName ? undefined : "none",
                        }}
                      >
                        <ChatPanel
                          pdfId={pdfId}
                          pdfName={pdfName}
                          injectText={injectText}
                          getPageText={async () =>
                            pdfViewerRef.current?.getPageText() ?? null
                          }
                          getPageNumber={() =>
                            pdfViewerRef.current?.getPageNumber() ?? null
                          }
                          hasPdfContext={hasPdfContext}
                          speak={speak}
                          onSaveToPage={handleOpenSaveToPage}
                        />
                      </div>
                    );
                  })}
              </section>
            )}
          </>
        )}
      </div>

      {/* Global drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-blue-500/10 pointer-events-none flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-xl border-2 border-blue-400 border-dashed">
            <p className="text-blue-600 font-medium text-sm">
              PDF를 여기에 놓으세요
            </p>
          </div>
        </div>
      )}

      {/* ── Sound settings modal ── */}
      {showSoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-900">소리 설정</h3>
              <button
                onClick={() => setShowSoundModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {/* Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-600">크기</label>
                  <span className="text-sm font-medium text-gray-800 w-10 text-right">
                    {Math.round(draftVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draftVolume}
                  onChange={(e) => setDraftVolume(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Rate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-600">속도</label>
                  <span className="text-sm font-medium text-gray-800 w-10 text-right">
                    {draftRate.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={draftRate}
                  onChange={(e) => setDraftRate(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>느림</span>
                  <span>빠름</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  if (typeof window === "undefined" || !window.speechSynthesis)
                    return;
                  window.speechSynthesis.cancel();
                  const sampleTexts: Record<string, string> = {
                    "de-DE": "Guten Morgen! Wie geht es Ihnen?",
                    "en-US": "Good morning! How are you?",
                    "en-GB": "Good morning! How are you?",
                    "fr-FR": "Bonjour ! Comment allez-vous ?",
                    "es-ES": "¡Buenos días! ¿Cómo está usted?",
                    "it-IT": "Buongiorno! Come sta?",
                    "ja-JP": "おはようございます！お元気ですか？",
                    "zh-CN": "早上好！你好吗？",
                  };
                  const lang = language || "en-US";
                  const utt = new SpeechSynthesisUtterance(
                    sampleTexts[lang] || sampleTexts["en-US"],
                  );
                  utt.lang = lang;
                  utt.volume = draftVolume;
                  utt.rate = draftRate;
                  window.speechSynthesis.speak(utt);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
                테스트
              </button>
              <button
                onClick={() => {
                  setVolume(draftVolume);
                  setRate(draftRate);
                  setShowSoundModal(false);
                }}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF picker modal ── */}
      {showPdfModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPdfModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">PDF 열기</h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="px-5 pt-4">
              <input
                ref={modalFileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const newChatId = generateChatId();
                  upsertLibraryMeta(f, newChatId);
                  savePdfToLibrary(f, newChatId).catch(() => {});
                  localStorage.setItem(LIBRARY_CURRENT_KEY, newChatId);
                  // Fix pdfId before adding to visitedPdfs (use filename if no pdfServerId yet)
                  const existingMeta = getLibraryMeta().find(
                    (m) => m.chatId === newChatId,
                  );
                  if (!pdfIdMap.current.has(f.name)) {
                    pdfIdMap.current.set(
                      f.name,
                      `${existingMeta?.pdfServerId ?? f.name}`,
                    );
                  }
                  setOpenFile(f);
                  setActivePdfName(f.name);
                  setActiveChatId(newChatId);
                  setPdfServerId(null);
                  setSelectedPageNode(null);
                  setViewMode("both");
                  setVisitedPdfs((prev) => new Set([...prev, f.name]));
                  setPdfLibrary(
                    getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt),
                  );
                  setShowPdfModal(false);
                  e.target.value = "";
                  // Upload to server — update library when done
                  if (!existingMeta?.pdfServerId) {
                    const formData = new FormData();
                    formData.append("file", f);
                    fetch("/api/pdfs", { method: "POST", body: formData })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => {
                        if (data?.id) {
                          setLibraryMetaPdfServerId(newChatId, data.id);
                          updateLibraryIndexStatus(
                            newChatId,
                            (data.index_status as NonNullable<
                              PdfMeta["indexStatus"]
                            >) ?? "pending",
                          );
                          // Update pdfId map so current session uses the stable uuid-based key
                          pdfIdMap.current.set(f.name, `${data.id}`);
                          setPdfServerId(data.id);
                          setPdfLibrary(
                            getLibraryMeta().sort(
                              (a, b) => a.addedAt - b.addedAt,
                            ),
                          );
                        }
                      })
                      .catch(() => {});
                  } else {
                    setPdfServerId(existingMeta.pdfServerId ?? null);
                  }
                }}
              />
              <button
                onClick={() => modalFileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
              >
                <svg
                  className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">
                  PDF 파일 선택
                </span>
              </button>
            </div>

            {modalLib.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-400 mb-2">
                  최근 사용한 파일
                </p>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {modalLib.map((meta) => (
                    <div
                      key={meta.chatId ?? meta.name}
                      className="flex items-center gap-1 group"
                    >
                      <button
                        onClick={async () => {
                          if (!meta.chatId) return;
                          let f = await loadPdfFromLibrary(meta.chatId);
                          if (!f)
                            f = await migratePdfKey(meta.name, meta.chatId);
                          if (!f) return;
                          if (!pdfIdMap.current.has(meta.name)) {
                            pdfIdMap.current.set(
                              meta.name,
                              `${meta.pdfServerId ?? meta.name}`,
                            );
                          }
                          setOpenFile(f);
                          setActivePdfName(meta.name);
                          setActiveChatId(meta.chatId ?? null);
                          setSelectedPageNode(null);
                          setViewMode("both");
                          setVisitedPdfs(
                            (prev) => new Set([...prev, meta.name]),
                          );
                          setShowPdfModal(false);
                          localStorage.setItem(
                            LIBRARY_CURRENT_KEY,
                            meta.chatId,
                          );
                        }}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left min-w-0"
                      >
                        <svg
                          className="w-4 h-4 text-red-400 shrink-0"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {meta.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {meta.lastOpened
                              ? new Date(meta.lastOpened).toLocaleDateString(
                                  "ko-KR",
                                  {
                                    month: "short",
                                    day: "numeric",
                                  },
                                )
                              : ""}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (meta.pdfServerId) {
                            fetch(`/api/pdfs/${meta.pdfServerId}`, {
                              method: "DELETE",
                            }).catch(() => {});
                          }
                          if (meta.chatId)
                            await deletePdfFromLibrary(meta.chatId);
                          const updated = meta.chatId
                            ? removeLibraryMeta(meta.chatId)
                            : getLibraryMeta();
                          setModalLib(updated);
                          setPdfLibrary(
                            updated.sort((a, b) => a.addedAt - b.addedAt),
                          );
                        }}
                        title="목록에서 삭제"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modalLib.length === 0 && (
              <p className="text-xs text-gray-400 text-center pb-5 pt-2">
                이전에 사용한 파일이 없습니다
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── New Folder modal ── */}
      {showNewFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewFolderModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                새 폴더 만들기
              </h3>
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                폴더를 사용해 PDF 요약, 메모, 단어장을 체계적으로 정리하세요.
                폴더 안에 하위 폴더와 페이지를 자유롭게 추가할 수 있습니다.
              </p>
              <label className="text-xs text-gray-500 mb-1.5 block">
                폴더 이름
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") setShowNewFolderModal(false);
                }}
                placeholder="예: 학습 노트"
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete PDF confirm modal ── */}
      {confirmDeletePdf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDeletePdf(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              채팅 삭제
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-1">
              <span className="font-medium text-gray-700">
                {pdfLibrary.find((m) => m.chatId === confirmDeletePdf)?.name ??
                  confirmDeletePdf}
              </span>{" "}
              를 삭제하시겠습니까?
            </p>
            <p className="text-xs text-red-500 mb-5">
              이 PDF와 연결된 채팅 기록도 함께 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeletePdf(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDeletePdf(confirmDeletePdf)}
                className="flex-1 py-2 rounded-xl bg-red-500 text-sm text-white hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset chat confirm modal ── */}
      {confirmResetPdf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmResetPdf(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              채팅 초기화
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-1">
              <span className="font-medium text-gray-700">
                {pdfLibrary.find((m) => m.chatId === confirmResetPdf)?.name ??
                  ""}
              </span>{" "}
              의 채팅 내용을 모두 삭제하시겠습니까?
            </p>
            <p className="text-xs text-gray-400 mb-5">PDF 파일은 유지됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmResetPdf(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleResetChat(confirmResetPdf)}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-sm text-white hover:bg-amber-600 transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save to page modal ── */}
      {showSaveToPageModal && (
        <SaveToPageModal
          content={saveToPageContent}
          nodes={treeNodes}
          onClose={() => {
            setShowSaveToPageModal(false);
            setSaveToPageContent("");
          }}
          onSave={handleSaveToPage}
        />
      )}

      {/* ── Account modal ── */}
      {showAccountModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAccountModal(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 relative">
            <button
              onClick={() => setShowAccountModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                  d="M18 6L6 18M6 6l12 12"
                />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              My account
            </h2>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  handleSignOut();
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-900">
                  Free usage today
                </span>
                <span className="text-xs text-gray-400">Resets at 09:00</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: "0%" }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    0/20 messages
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: "0%" }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    0/2 chats per day
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200">
                <span className="text-sm text-gray-600">Free plan</span>
                <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
                  Upgrade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Language modal ── */}
      {showLanguageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLanguageModal(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Language</h3>
              <button
                onClick={() => setShowLanguageModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 p-3 max-h-80 overflow-y-auto">
              {[
                { flag: "\u{1F1FA}\u{1F1F8}", name: "English", code: "en-US" },
                {
                  flag: "\u{1F1EA}\u{1F1F8}",
                  name: "Espa\u00f1ol",
                  code: "es-ES",
                },
                {
                  flag: "\u{1F1EB}\u{1F1F7}",
                  name: "Fran\u00e7ais",
                  code: "fr-FR",
                },
                { flag: "\u{1F1E9}\u{1F1EA}", name: "Deutsch", code: "de-DE" },
                { flag: "\u{1F1EE}\u{1F1F9}", name: "Italiano", code: "it-IT" },
                {
                  flag: "\u{1F1E7}\u{1F1F7}",
                  name: "Portugu\u00eas",
                  code: "pt-BR",
                },
                {
                  flag: "\u{1F1F7}\u{1F1FA}",
                  name: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
                  code: "ru-RU",
                },
                {
                  flag: "\u{1F1EF}\u{1F1F5}",
                  name: "\u65e5\u672c\u8a9e",
                  code: "ja-JP",
                },
                {
                  flag: "\u{1F1E8}\u{1F1F3}",
                  name: "\u4e2d\u6587",
                  code: "zh-CN",
                },
                {
                  flag: "\u{1F1F0}\u{1F1F7}",
                  name: "\ud55c\uad6d\uc5b4",
                  code: "ko-KR",
                },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setShowLanguageModal(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors ${
                    language === lang.code
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base">{lang.flag}</span>
                  <span className="truncate">{lang.name}</span>
                  {language === lang.code && (
                    <svg
                      className="w-3.5 h-3.5 ml-auto text-gray-900 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 6L9 17l-5-5"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  );
}
