"use client";

import { useState, useRef, useEffect } from "react";
import { type TreeNode, type NodeType, getChildren, getDescendantIds } from "@/lib/tree";
import { type PdfMeta } from "@/lib/pdfLibrary";

// ── Drag data types ────────────────────────────────────────────────────────
const PDF_DRAG_TYPE = "application/x-lingua-pdf-chatid";
const NODE_DRAG_TYPE = "application/x-lingua-node-id";

// ── Icons ──────────────────────────────────────────────────────────────────

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    className={`w-3 h-3 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const IconFolder = ({ open }: { open?: boolean }) => (
  <svg className="w-3.5 h-3.5 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
    {open ? (
      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H2V6zm0 3h20v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" />
    ) : (
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    )}
  </svg>
);

const IconPdfPage = () => (
  <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" opacity={0.4} />
    <path
      d="M14 2v6h6"
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const IconNotePage = () => (
  <svg
    className="w-3.5 h-3.5 text-blue-400 shrink-0"
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconDots = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

// ── Shared hook: click-outside to close menu ─────────────────────────────
function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, ref, onClose]);
}

// ── FolderPdfItem — PDF rendered inside a folder ─────────────────────────

interface FolderPdfItemProps {
  meta: PdfMeta;
  depth: number;
  activePdfName: string | null;
  onSelectPdf: (meta: PdfMeta) => void;
  onRemoveFromFolder: (chatId: string) => void;
  onRenamePdf: (chatId: string, newName: string) => void;
  onResetPdf: (chatId: string) => void;
  onDeletePdf: (chatId: string) => void;
  onDragActiveChange: (active: boolean) => void;
}

function FolderPdfItem({
  meta, depth, activePdfName, onSelectPdf, onRemoveFromFolder,
  onRenamePdf, onResetPdf, onDeletePdf, onDragActiveChange,
}: FolderPdfItemProps) {
  const isActive = activePdfName === meta.name;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== meta.name && meta.chatId) {
      onRenamePdf(meta.chatId, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => {
        if (renaming) { e.preventDefault(); return; }
        e.dataTransfer.setData(PDF_DRAG_TYPE, meta.chatId!);
        e.dataTransfer.effectAllowed = "move";
        onDragActiveChange(true);
      }}
      onDragEnd={() => onDragActiveChange(false)}
      onClick={() => { if (!renaming) onSelectPdf(meta); }}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={`flex items-center gap-1 pr-1 h-8 group rounded-md select-none transition-colors ${
        renaming ? "cursor-text" : "cursor-grab active:cursor-grabbing"
      } ${isActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
    >
      {/* Spacer (no chevron) */}
      <span className="w-4 shrink-0" />

      {/* PDF icon */}
      <svg className="w-3 h-3 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
      </svg>

      {/* Name or rename input */}
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-1 py-0 text-xs text-gray-900 outline-none"
        />
      ) : (
        <span className={`flex-1 text-xs truncate ${isActive ? "text-blue-700 font-medium" : "text-gray-700"}`}>
          {meta.name}
        </span>
      )}

      {/* Context menu */}
      {!renaming && (
        <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`p-1 rounded transition-all text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${
              menuOpen ? "opacity-100 bg-gray-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <IconDots />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-36">
              <button
                onClick={() => { setRenameValue(meta.name); setRenaming(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                이름 변경
              </button>
              <button
                onClick={() => { if (meta.chatId) onRemoveFromFolder(meta.chatId); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                채팅 목록으로 꺼내기
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { if (meta.chatId) onResetPdf(meta.chatId); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                채팅 초기화
              </button>
              <button
                onClick={() => { if (meta.chatId) onDeletePdf(meta.chatId); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TreeNodeRow ────────────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: TreeNode;
  nodes: TreeNode[];
  depth: number;
  selectedNodeId: string | null;
  onSelect: (node: TreeNode) => void;
  onAddNode: (parentId: string | null, type: NodeType) => void;
  onDelete: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  // PDF-in-folder support
  folderPdfs: Map<string, PdfMeta[]>;
  activePdfName: string | null;
  onSelectPdf: (meta: PdfMeta) => void;
  onDropPdf: (chatId: string, folderId: string) => void;
  onRemoveFromFolder: (chatId: string) => void;
  onRenamePdf: (chatId: string, newName: string) => void;
  onResetPdf: (chatId: string) => void;
  onDeletePdf: (chatId: string) => void;
  isDraggingItem: boolean;
  onDragActiveChange: (active: boolean) => void;
}

function TreeNodeRow({
  node, nodes, depth, selectedNodeId, onSelect, onAddNode, onDelete, onMoveNode, onRenameNode,
  folderPdfs, activePdfName, onSelectPdf, onDropPdf, onRemoveFromFolder,
  onRenamePdf, onResetPdf, onDeletePdf, isDraggingItem, onDragActiveChange,
}: TreeNodeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const children = node.type === "folder" ? getChildren(nodes, node.id) : [];
  const pdfsInFolder = node.type === "folder" ? (folderPdfs.get(node.id) ?? []) : [];
  const isSelected = selectedNodeId === node.id;

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRenameNode(node.id, trimmed);
    }
    setRenaming(false);
  };

  // ── Drag source (this node is draggable) ──
  const handleDragStart = (e: React.DragEvent) => {
    if (renaming) { e.preventDefault(); return; }
    e.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
    onDragActiveChange(true);
  };

  const handleDragEnd = () => onDragActiveChange(false);

  // ── Drop target (folders accept PDF + node drops) ──
  const handleDragOver = (e: React.DragEvent) => {
    if (node.type !== "folder") return;
    const hasPdf = e.dataTransfer.types.includes(PDF_DRAG_TYPE);
    const hasNode = e.dataTransfer.types.includes(NODE_DRAG_TYPE);
    if (!hasPdf && !hasNode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    setDragOver(false);
    if (node.type !== "folder") return;
    e.preventDefault();
    e.stopPropagation();

    // Handle PDF drop
    const chatId = e.dataTransfer.getData(PDF_DRAG_TYPE);
    if (chatId) {
      onDropPdf(chatId, node.id);
      if (!expanded) setExpanded(true);
      return;
    }

    // Handle tree node drop
    const nodeId = e.dataTransfer.getData(NODE_DRAG_TYPE);
    if (nodeId && nodeId !== node.id) {
      // Prevent dropping a folder into its own descendant
      const descendantIds = getDescendantIds(nodes, nodeId);
      if (descendantIds.includes(node.id)) return;
      onMoveNode(nodeId, node.id);
      if (!expanded) setExpanded(true);
    }
  };

  return (
    <>
      <div
        draggable={!renaming}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (renaming) return;
          if (node.type === "folder") setExpanded((v) => !v);
          else onSelect(node);
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`flex items-center gap-1 pr-1 h-8 group select-none transition-colors rounded-md ${
          renaming ? "cursor-text" : "cursor-grab active:cursor-grabbing"
        } ${
          dragOver
            ? "bg-blue-100 ring-1 ring-blue-400"
            : isDraggingItem && node.type === "folder"
              ? "bg-blue-200/70 border-2 border-dashed border-blue-500"
              : isSelected ? "bg-blue-50" : "hover:bg-gray-50"
        }`}
      >
        {/* Chevron / spacer */}
        <span className="w-4 flex items-center justify-center shrink-0">
          {node.type === "folder" && <IconChevron open={expanded} />}
        </span>

        {/* Icon */}
        {node.type === "folder" ? (
          <IconFolder open={expanded} />
        ) : node.pdfId ? (
          <IconPdfPage />
        ) : (
          <IconNotePage />
        )}

        {/* Name or rename input */}
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-1 py-0 text-xs text-gray-900 outline-none"
          />
        ) : (
          <span
            className={`flex-1 text-xs truncate ${
              isSelected ? "text-blue-700 font-medium" : "text-gray-700"
            }`}
          >
            {node.name}
          </span>
        )}

        {/* Context menu */}
        {!renaming && (
          <div
            ref={menuRef}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`p-1 rounded transition-all text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${
                menuOpen ? "opacity-100 bg-gray-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <IconDots />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-36">
                {/* Rename — available for all node types */}
                <button
                  onClick={() => { setRenameValue(node.name); setRenaming(true); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  이름 변경
                </button>

                {node.type === "folder" && (
                  <>
                    <button
                      onClick={() => { onAddNode(node.id, "page"); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      페이지 추가
                    </button>
                    <button
                      onClick={() => { onAddNode(node.id, "folder"); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      폴더 추가
                    </button>
                  </>
                )}

                {node.parentId !== null && (
                  <button
                    onClick={() => { onMoveNode(node.id, null); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    최상위로 이동
                  </button>
                )}

                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { onDelete(node.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children: PDFs first (top), then tree nodes */}
      {node.type === "folder" && expanded && (
        <>
          {pdfsInFolder.map((meta) => (
            <FolderPdfItem
              key={meta.chatId}
              meta={meta}
              depth={depth + 1}
              activePdfName={activePdfName}
              onSelectPdf={onSelectPdf}
              onRemoveFromFolder={onRemoveFromFolder}
              onRenamePdf={onRenamePdf}
              onResetPdf={onResetPdf}
              onDeletePdf={onDeletePdf}
              onDragActiveChange={onDragActiveChange}
            />
          ))}
          {children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              onAddNode={onAddNode}
              onDelete={onDelete}
              onMoveNode={onMoveNode}
              onRenameNode={onRenameNode}
              folderPdfs={folderPdfs}
              activePdfName={activePdfName}
              onSelectPdf={onSelectPdf}
              onDropPdf={onDropPdf}
              onRemoveFromFolder={onRemoveFromFolder}
              onRenamePdf={onRenamePdf}
              onResetPdf={onResetPdf}
              onDeletePdf={onDeletePdf}
              isDraggingItem={isDraggingItem}
              onDragActiveChange={onDragActiveChange}
            />
          ))}
        </>
      )}
    </>
  );
}

// ── SidebarTree (root) ─────────────────────────────────────────────────────

export interface SidebarTreeProps {
  nodes: TreeNode[];
  selectedNodeId: string | null;
  onSelect: (node: TreeNode) => void;
  onAddNode: (parentId: string | null, type: NodeType) => void;
  onDelete: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  // PDF-in-folder support
  pdfLibrary?: PdfMeta[];
  activePdfName?: string | null;
  onSelectPdf?: (meta: PdfMeta) => void;
  onDropPdf?: (chatId: string, folderId: string) => void;
  onRemoveFromFolder?: (chatId: string) => void;
  onRenamePdf?: (chatId: string, newName: string) => void;
  onResetPdf?: (chatId: string) => void;
  onDeletePdf?: (chatId: string) => void;
  isDraggingItem?: boolean;
  onDragActiveChange?: (active: boolean) => void;
}

export default function SidebarTree({
  nodes, selectedNodeId, onSelect, onAddNode, onDelete, onMoveNode, onRenameNode,
  pdfLibrary = [], activePdfName = null,
  onSelectPdf, onDropPdf, onRemoveFromFolder, onRenamePdf, onResetPdf, onDeletePdf,
  isDraggingItem = false, onDragActiveChange,
}: SidebarTreeProps) {
  const roots = getChildren(nodes, null);

  // Group PDFs by folderId
  const folderPdfs = new Map<string, PdfMeta[]>();
  for (const meta of pdfLibrary) {
    if (meta.folderId) {
      const list = folderPdfs.get(meta.folderId) ?? [];
      list.push(meta);
      folderPdfs.set(meta.folderId, list);
    }
  }

  const noop = () => {};
  const noopStr = () => {};

  return (
    <div className="px-1.5">
      {roots.length === 0 ? (
        <p className="text-xs text-gray-300 px-2 py-4 text-center leading-relaxed">
          PDF를 추가하거나<br />폴더를 만들어보세요
        </p>
      ) : (
        roots.map((node) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            nodes={nodes}
            depth={0}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onAddNode={onAddNode}
            onDelete={onDelete}
            onMoveNode={onMoveNode}
            onRenameNode={onRenameNode}
            folderPdfs={folderPdfs}
            activePdfName={activePdfName}
            onSelectPdf={onSelectPdf ?? noop}
            onDropPdf={onDropPdf ?? noop}
            onRemoveFromFolder={onRemoveFromFolder ?? noop}
            onRenamePdf={onRenamePdf ?? noopStr}
            onResetPdf={onResetPdf ?? noop}
            onDeletePdf={onDeletePdf ?? noop}
            isDraggingItem={isDraggingItem}
            onDragActiveChange={onDragActiveChange ?? noop}
          />
        ))
      )}
    </div>
  );
}

export { PDF_DRAG_TYPE };
