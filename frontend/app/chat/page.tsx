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
  savePdfToLibrary,
  deletePdfFromLibrary,
  removeLibraryMeta,
  setLibraryMetaServerId,
  upsertLibraryMeta,
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
import SidebarTree from "@/components/SidebarTree";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
});

const PageViewer = dynamic(() => import("@/components/PageViewer"), {
  ssr: false,
});

const CHAT_MIN = 280;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 560;

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 240;

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
  const [pdfLibrary, setPdfLibrary] = useState<PdfMeta[]>([]);
  const [parentServerId, setParentServerId] = useState<string | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Folders / tree state
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedPageNode, setSelectedPageNode] = useState<TreeNode | null>(null);

  // Save-to-page modal state
  const [showSaveToPageModal, setShowSaveToPageModal] = useState(false);
  const [saveToPageContent, setSaveToPageContent] = useState("");

  // PDF delete confirm modal
  const [confirmDeletePdf, setConfirmDeletePdf] = useState<string | null>(null);

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // PDF text injection state — uses id to re-trigger same text
  const [injectText, setInjectText] = useState<{ text: string; id: number } | undefined>();
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

  const healthStatus = useBackendHealth();
  const { speak, speakWithOptions, volume, setVolume, rate, setRate, language, setLanguage } = useTTS();
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [draftVolume, setDraftVolume] = useState(volume);
  const [draftRate, setDraftRate] = useState(rate);

  // Initialize from localStorage (run once on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedViewMode = localStorage.getItem("lingua_view_mode") as ViewMode | null;
    if (savedViewMode === "both" || savedViewMode === "pdf" || savedViewMode === "chat") {
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
    const lastPdfName = localStorage.getItem(LIBRARY_CURRENT_KEY);
    if (lastPdfName && library.some((m) => m.name === lastPdfName)) {
      const lastMeta = library.find((m) => m.name === lastPdfName);
      pdfIdMap.current.set(lastPdfName, `${lastMeta?.serverId ?? lastPdfName}`);
      setActivePdfName(lastPdfName);
      setVisitedPdfs(new Set([lastPdfName]));
      if (!savedViewMode || savedViewMode === "chat") setViewMode("both");
    }

    setInitialized(true);

    // Async: fetch server PDF list and merge with localStorage
    fetch("/api/pdfs")
      .then((r) => (r.ok ? r.json() : []))
      .then((serverPdfs: Array<{ id: string; name: string; size: number; created_at: number }>) => {
        if (!serverPdfs.length) return;
        const local = getLibraryMeta();
        const localByName = new Map(local.map((m) => [m.name, m]));
        let changed = false;
        const toAdd: PdfMeta[] = [];

        for (const sp of serverPdfs) {
          const existing = localByName.get(sp.name);
          if (existing) {
            if (!existing.serverId) {
              setLibraryMetaServerId(sp.name, sp.id);
              changed = true;
            }
          } else {
            toAdd.push({
              name: sp.name,
              size: sp.size,
              lastOpened: new Date(sp.created_at * 1000).toISOString(),
              addedAt: sp.created_at * 1000,
              serverId: sp.id,
            });
            changed = true;
          }
        }

        if (toAdd.length > 0) {
          const merged = [...getLibraryMeta(), ...toAdd];
          localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(merged));
        }

        if (changed) {
          setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
        }
      })
      .catch(() => {});
  }, []);

  // Refresh PDF library when a new file is opened
  useEffect(() => {
    if (!initialized) return;
    // Small delay to let PdfViewer save the file to library first
    const t = setTimeout(() => setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt)), 300);
    return () => clearTimeout(t);
  }, [openFile, initialized]);

  // Fetch user info
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User",
          email: user.email ?? "",
        });
      }
    });
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

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

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isChatResizingRef.current) {
        const delta = chatDragStartX.current - e.clientX;
        const next = Math.max(CHAT_MIN, Math.min(CHAT_MAX, chatDragStartWidth.current + delta));
        setChatWidth(next);
      }
      if (isSidebarResizingRef.current) {
        const delta = e.clientX - sidebarDragStartX.current;
        const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, sidebarDragStartWidth.current + delta));
        setSidebarWidth(next);
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
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Tree handlers ────────────────────────────────────────────────────────

  const handleAddNode = useCallback((parentId: string | null, type: NodeType) => {
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
  }, [treeNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    const idsToRemove = getDescendantIds(treeNodes, nodeId);
    const next = treeNodes.filter((n) => !idsToRemove.includes(n.id));
    setTreeNodes(next);
    saveTree(next);
    setSelectedPageNode((prev) =>
      prev && idsToRemove.includes(prev.id) ? null : prev,
    );
  }, [treeNodes]);

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
        prev?.id === nodeId ? (next.find((n) => n.id === nodeId) ?? null) : prev,
      );
    },
    [treeNodes],
  );

  const handleSaveToPage = useCallback((result: SaveResult) => {
    const now = Date.now();
    let next = [...treeNodes];
    if (result.mode === "new-folder-page") {
      const folderId = crypto.randomUUID();
      const pageId = crypto.randomUUID();
      next = [
        ...next,
        { id: folderId, type: "folder" as const, name: result.folderName, parentId: null, order: nextOrder(next, null), createdAt: now },
        { id: pageId, type: "page" as const, name: result.pageName, parentId: folderId, order: 0, createdAt: now, content: saveToPageContent, updatedAt: now },
      ];
    } else if (result.mode === "new-page") {
      const pageId = crypto.randomUUID();
      next = [
        ...next,
        { id: pageId, type: "page" as const, name: result.pageName, parentId: result.parentId, order: nextOrder(next, result.parentId), createdAt: now, content: saveToPageContent, updatedAt: now },
      ];
    } else {
      const target = next.find((n) => n.id === result.nodeId);
      if (target) {
        const appended = (target.content ?? "") + "\n\n" + saveToPageContent;
        next = next.map((n) => n.id === result.nodeId ? { ...n, content: appended, updatedAt: now } : n);
        setSelectedPageNode((prev) => prev?.id === result.nodeId ? (next.find((n) => n.id === result.nodeId) ?? null) : prev);
      }
    }
    setTreeNodes(next);
    saveTree(next);
    setShowSaveToPageModal(false);
    setSaveToPageContent("");
  }, [treeNodes, saveToPageContent]);

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
    router.push("/login");
  };

  const handleSelectPdf = async (meta: PdfMeta) => {
    // Try IDB first (fast, offline)
    let f = await loadPdfFromLibrary(meta.name);

    // Fallback: fetch from server if not in IDB
    if (!f && meta.serverId) {
      try {
        const res = await fetch(`/api/pdfs/${meta.serverId}/file`);
        if (res.ok) {
          const blob = await res.blob();
          f = new File([blob], meta.name, { type: "application/pdf" });
          savePdfToLibrary(f).catch(() => {});
        }
      } catch { /* ignore */ }
    }

    if (!f) return;
    if (!pdfIdMap.current.has(meta.name)) {
      pdfIdMap.current.set(meta.name, `${meta.serverId ?? meta.name}`);
    }
    setOpenFile(f);
    setActivePdfName(meta.name);
    setSelectedPageNode(null);
    setViewMode("both");
    setVisitedPdfs((prev) => new Set([...prev, meta.name]));
  };

  const handleDeletePdf = async (name: string) => {
    const meta = pdfLibrary.find((m) => m.name === name);

    // Local cleanup
    await deletePdfFromLibrary(name);
    const updated = removeLibraryMeta(name);
    setPdfLibrary(updated.sort((a, b) => a.addedAt - b.addedAt));

    // Server cleanup (fire-and-forget)
    if (meta?.serverId) {
      fetch(`/api/pdfs/${meta.serverId}`, { method: "DELETE" }).catch(() => {});
    }

    if (activePdfName === name) {
      setActivePdfName(null);
      setOpenFile(null);
      setViewMode("chat");
    }
    setVisitedPdfs((prev) => { const s = new Set(prev); s.delete(name); return s; });
    setConfirmDeletePdf(null);
  };

  const showPdf = (viewMode === "pdf" || viewMode === "both") && !selectedPageNode;
  const showChat = viewMode === "chat" || viewMode === "both";

  return (
    <div
      className={`flex h-screen bg-gray-50 flex-col${isChatResizing || isSidebarResizing ? " select-none cursor-col-resize" : ""}`}
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
          <span className="font-bold text-sm text-gray-900 me-1">LinguaRAG</span>
          <button
            onClick={() => setShowSidebar((v) => !v)}
            title="사이드바 열고 닫기"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        </div>

        {/* Center — current document/unit name */}
        <div className="flex-1 flex justify-center min-w-0 px-4">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
            {selectedPageNode
              ? selectedPageNode.name
              : activePdfName ?? "PDF를 선택하세요"}
          </span>
        </div>

        {/* Right — view toggle + user */}
        <div className="flex items-center gap-1 shrink-0">
          {/* PDF only */}
          <button
            onClick={() => { setViewMode("pdf"); setSelectedPageNode(null); }}
            title="PDF만 보기"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "pdf" && !selectedPageNode ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          {/* Both */}
          <button
            onClick={() => { setViewMode("both"); setSelectedPageNode(null); }}
            title="PDF + 채팅"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "both" && !selectedPageNode ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" />
            </svg>
          </button>
          {/* Chat only */}
          <button
            onClick={() => { setViewMode("chat"); setSelectedPageNode(null); }}
            title="채팅만 보기"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "chat" && !selectedPageNode ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* User button */}
          <div ref={userMenuRef} className="relative">
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 w-44">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setDraftVolume(volume);
                      setDraftRate(rate);
                      setShowSoundModal(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                    소리 설정
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
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

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — resizable, collapsible */}
        {showSidebar && (
          <aside
            className="bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 overflow-hidden relative"
            style={{ width: sidebarWidth }}
          >

            {/* ── Chats section ── */}
            <div className="px-1.5 py-2 shrink-0">
              <div className="flex items-center gap-1 px-1.5 py-1 text-sm text-gray-700 font-medium">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                Chats
              </div>
              <div className="overflow-y-auto max-h-52 space-y-0.5">
                {pdfLibrary.filter((m) => m.serverId).length === 0 ? (
                  <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                    PDF를 추가해보세요
                  </p>
                ) : (
                  pdfLibrary.filter((m) => m.serverId).map((meta) => (
                    <div
                      key={meta.name}
                      className={`group flex items-center rounded-md transition-colors ${
                        activePdfName === meta.name ? "bg-gray-200" : "hover:bg-gray-100"
                      }`}
                    >
                      <button
                        onClick={() => handleSelectPdf(meta)}
                        className={`flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1.5 text-xs truncate ${
                          activePdfName === meta.name ? "text-gray-900 font-medium" : "text-gray-500 group-hover:text-gray-800"
                        }`}
                      >
                        <svg className="w-3 h-3 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
                        </svg>
                        <span className="truncate">{meta.name}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeletePdf(meta.name); }}
                        title="삭제"
                        className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200 mx-2 shrink-0" />

            {/* ── Folders section ── */}
            <div className="px-1.5 py-2 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between px-1.5 py-1 shrink-0">
                <div className="flex items-center gap-1 text-sm text-gray-700 font-medium">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                  </svg>
                  Folders
                </div>
                <button
                  onClick={() => { setNewFolderName(""); setShowNewFolderModal(true); }}
                  title="새 폴더 만들기"
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {treeNodes.length === 0 ? (
                  <p className="text-xs text-gray-300 px-1.5 py-3 text-center leading-relaxed">
                    폴더를 만들어<br />파일을 정리해보세요
                  </p>
                ) : (
                  <SidebarTree
                    nodes={treeNodes}
                    selectedNodeId={selectedPageNode?.id ?? null}
                    onSelect={handleSelectNode}
                    onAddNode={handleAddNode}
                    onDelete={handleDeleteNode}
                  />
                )}
              </div>
            </div>

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

        {/* Page viewer (replaces PDF area when a page is selected) */}
        {selectedPageNode && (
          <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0">
              <button
                onClick={() => setSelectedPageNode(null)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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
                parentServerId={parentServerId}
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
              isChatResizing ? "bg-blue-400" : "bg-gray-200 hover:bg-blue-300"
            }`}
          />
        )}

        {/* Chat panel */}
        {showChat && (
          <section
            className={`flex flex-col overflow-hidden bg-white${viewMode === "both" && !selectedPageNode ? " shrink-0" : " flex-1"}`}
            style={viewMode === "both" && !selectedPageNode ? { width: chatWidth } : undefined}
          >
            {initialized && visitedPdfs.size === 0 && !activePdfName && (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Chats에서 PDF를 선택하세요
              </div>
            )}
            {/* Persistent chat panels — one per visited PDF */}
            {initialized &&
              [...visitedPdfs].map((pdfName) => {
                const pdfId = pdfIdMap.current.get(pdfName) ?? pdfName;
                return (
                  <div
                    key={pdfName}
                    className="flex-1 flex flex-col overflow-hidden"
                    style={{ display: pdfName === activePdfName ? undefined : "none" }}
                  >
                    <ChatPanel
                      pdfId={pdfId}
                      pdfName={pdfName}
                      injectText={injectText}
                      getPageText={async () => pdfViewerRef.current?.getPageText() ?? null}
                      hasPdfContext={hasPdfContext}
                      speak={speak}
                      onSaveToPage={handleOpenSaveToPage}
                    />
                  </div>
                );
              })}
          </section>
        )}
      </div>

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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
                  type="range" min="0" max="1" step="0.05"
                  value={draftVolume}
                  onChange={(e) => setDraftVolume(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>0%</span><span>100%</span>
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
                  type="range" min="0.5" max="1.5" step="0.1"
                  value={draftRate}
                  onChange={(e) => setDraftRate(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>느림</span><span>빠름</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  if (typeof window === "undefined" || !window.speechSynthesis) return;
                  window.speechSynthesis.cancel();
                  const utt = new SpeechSynthesisUtterance("Guten Morgen! Wie geht es Ihnen?");
                  utt.lang = "de-DE";
                  utt.volume = draftVolume;
                  utt.rate = draftRate;
                  window.speechSynthesis.speak(utt);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
                테스트
              </button>
              <button
                onClick={() => { setVolume(draftVolume); setRate(draftRate); setShowSoundModal(false); }}
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
          onClick={(e) => { if (e.target === e.currentTarget) setShowPdfModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">PDF 열기</h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
                  upsertLibraryMeta(f);
                  savePdfToLibrary(f).catch(() => {});
                  // Fix pdfId before adding to visitedPdfs (use filename if no serverId yet)
                  const existingMeta = getLibraryMeta().find((m) => m.name === f.name);
                  if (!pdfIdMap.current.has(f.name)) {
                    pdfIdMap.current.set(f.name, `${existingMeta?.serverId ?? f.name}`);
                  }
                  setOpenFile(f);
                  setActivePdfName(f.name);
                  setParentServerId(null);
                  setSelectedPageNode(null);
                  setViewMode("both");
                  setVisitedPdfs((prev) => new Set([...prev, f.name]));
                  setShowPdfModal(false);
                  e.target.value = "";
                  // Upload to server — update library when done
                  if (!existingMeta?.serverId) {
                    const formData = new FormData();
                    formData.append("file", f);
                    fetch("/api/pdfs", { method: "POST", body: formData })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => {
                        if (data?.id) {
                          setLibraryMetaServerId(f.name, data.id);
                          // Update pdfId map so current session uses the stable uuid-based key
                          pdfIdMap.current.set(f.name, `${data.id}`);
                          setParentServerId(data.id);
                          setPdfLibrary(getLibraryMeta().sort((a, b) => a.addedAt - b.addedAt));
                        }
                      })
                      .catch(() => {});
                  } else {
                    setParentServerId(existingMeta.serverId ?? null);
                  }
                }}
              />
              <button
                onClick={() => modalFileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
              >
                <svg
                  className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">
                  PDF 파일 선택
                </span>
              </button>
            </div>

            {modalLib.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-400 mb-2">최근 사용한 파일</p>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {modalLib.map((meta) => (
                    <div key={meta.name} className="flex items-center gap-1 group">
                      <button
                        onClick={async () => {
                          const f = await loadPdfFromLibrary(meta.name);
                          if (!f) return;
                          if (!pdfIdMap.current.has(meta.name)) {
                            pdfIdMap.current.set(meta.name, `${meta.serverId ?? meta.name}`);
                          }
                          setOpenFile(f);
                          setActivePdfName(meta.name);
                          setSelectedPageNode(null);
                          setViewMode("both");
                          setVisitedPdfs((prev) => new Set([...prev, meta.name]));
                          setShowPdfModal(false);
                        }}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left min-w-0"
                      >
                        <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{meta.name}</p>
                          <p className="text-xs text-gray-400">
                            {meta.lastOpened
                              ? new Date(meta.lastOpened).toLocaleDateString("ko-KR", {
                                  month: "short", day: "numeric",
                                })
                              : ""}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (meta.serverId) {
                            fetch(`/api/pdfs/${meta.serverId}`, { method: "DELETE" }).catch(() => {});
                          }
                          await deletePdfFromLibrary(meta.name);
                          const updated = removeLibraryMeta(meta.name);
                          setModalLib(updated);
                          setPdfLibrary(updated.sort((a, b) => a.addedAt - b.addedAt));
                        }}
                        title="목록에서 삭제"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modalLib.length === 0 && (
              <p className="text-xs text-gray-400 text-center pb-5 pt-2">이전에 사용한 파일이 없습니다</p>
            )}
          </div>
        </div>
      )}

      {/* ── New Folder modal ── */}
      {showNewFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewFolderModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">새 폴더 만들기</h3>
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                폴더를 사용해 PDF 요약, 메모, 단어장을 체계적으로 정리하세요.
                폴더 안에 하위 폴더와 페이지를 자유롭게 추가할 수 있습니다.
              </p>
              <label className="text-xs text-gray-500 mb-1.5 block">폴더 이름</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") setShowNewFolderModal(false);
                }}
                placeholder="예: 독독독 A1 노트"
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
            <h3 className="text-sm font-semibold text-gray-900 mb-2">PDF 삭제</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-1">
              <span className="font-medium text-gray-700">{confirmDeletePdf}</span> 를 삭제하시겠습니까?
            </p>
            <p className="text-xs text-red-500 mb-5">이 PDF와 연결된 채팅 기록도 함께 삭제됩니다.</p>
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

      {/* ── Save to page modal ── */}
      {showSaveToPageModal && (
        <SaveToPageModal
          content={saveToPageContent}
          nodes={treeNodes}
          onClose={() => { setShowSaveToPageModal(false); setSaveToPageContent(""); }}
          onSave={handleSaveToPage}
        />
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
