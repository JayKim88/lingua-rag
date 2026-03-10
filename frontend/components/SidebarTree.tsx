"use client";

import { useState, useRef, useEffect } from "react";
import { type TreeNode, type NodeType, getChildren } from "@/lib/tree";

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

// ── TreeNodeRow ────────────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: TreeNode;
  nodes: TreeNode[];
  depth: number;
  selectedNodeId: string | null;
  onSelect: (node: TreeNode) => void;
  onAddNode: (parentId: string | null, type: NodeType) => void;
  onDelete: (nodeId: string) => void;
}

function TreeNodeRow({
  node, nodes, depth, selectedNodeId, onSelect, onAddNode, onDelete,
}: TreeNodeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const children = node.type === "folder" ? getChildren(nodes, node.id) : [];
  const isSelected = selectedNodeId === node.id;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      <div
        onClick={() => {
          if (node.type === "folder") setExpanded((v) => !v);
          else onSelect(node);
        }}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`flex items-center gap-1 pr-1 h-8 group cursor-pointer rounded-md select-none transition-colors ${
          isSelected ? "bg-blue-50" : "hover:bg-gray-50"
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

        {/* Name */}
        <span
          className={`flex-1 text-xs truncate ${
            isSelected ? "text-blue-700 font-medium" : "text-gray-700"
          }`}
        >
          {node.name}
        </span>

        {/* Context menu */}
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
                  <div className="border-t border-gray-100 my-1" />
                </>
              )}
              <button
                onClick={() => { onDelete(node.id); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {node.type === "folder" && expanded &&
        children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            nodes={nodes}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onAddNode={onAddNode}
            onDelete={onDelete}
          />
        ))
      }
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
}

export default function SidebarTree({
  nodes, selectedNodeId, onSelect, onAddNode, onDelete,
}: SidebarTreeProps) {
  const roots = getChildren(nodes, null);

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
          />
        ))
      )}
    </div>
  );
}
