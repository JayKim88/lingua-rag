"use client";

import { useState, useMemo } from "react";
import { type TreeNode } from "@/lib/tree";

export type SaveMode = "new-folder-page" | "new-page" | "append";

export type SaveResult =
  | { mode: "new-folder-page"; folderName: string; pageName: string }
  | { mode: "new-page"; parentId: string | null; pageName: string }
  | { mode: "append"; nodeId: string };

interface SaveToPageModalProps {
  content: string;
  nodes: TreeNode[];
  onClose: () => void;
  onSave: (result: SaveResult) => void;
}

export default function SaveToPageModal({
  content,
  nodes,
  onClose,
  onSave,
}: SaveToPageModalProps) {
  const folders = useMemo(
    () => nodes.filter((n) => n.type === "folder").sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    [nodes],
  );
  const recentPages = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "page")
        .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
        .slice(0, 5),
    [nodes],
  );

  const [mode, setMode] = useState<SaveMode>("new-page");

  // new-folder-page
  const [newFolderName, setNewFolderName] = useState("");
  const [newPageName1, setNewPageName1] = useState("");

  // new-page
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    folders[0]?.id ?? null,
  );
  const [newPageName2, setNewPageName2] = useState("");

  // append
  const [appendNodeId, setAppendNodeId] = useState<string | null>(
    recentPages[0]?.id ?? null,
  );

  const canSave = (() => {
    if (mode === "new-folder-page") return newFolderName.trim().length > 0 && newPageName1.trim().length > 0;
    if (mode === "new-page") return newPageName2.trim().length > 0;
    return appendNodeId !== null;
  })();

  const handleSave = () => {
    if (!canSave) return;
    if (mode === "new-folder-page") {
      onSave({ mode, folderName: newFolderName.trim(), pageName: newPageName1.trim() });
    } else if (mode === "new-page") {
      onSave({ mode, parentId: selectedFolderId, pageName: newPageName2.trim() });
    } else {
      onSave({ mode: "append", nodeId: appendNodeId! });
    }
  };

  const previewLines = content.trim().split("\n").slice(0, 3).join("\n");
  const previewTruncated = content.trim().split("\n").length > 3;

  const TAB_CLASSES = (active: boolean) =>
    `flex-1 text-xs py-2 rounded-lg border transition-colors font-medium ${
      active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">페이지에 저장</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content preview */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
          <p className="text-xs text-gray-400 mb-1.5">저장할 내용</p>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap line-clamp-3">
            {previewLines}{previewTruncated ? "\n…" : ""}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 px-5 pt-4 shrink-0">
          <button onClick={() => setMode("new-folder-page")} className={TAB_CLASSES(mode === "new-folder-page")}>
            새 폴더 + 페이지
          </button>
          <button onClick={() => setMode("new-page")} className={TAB_CLASSES(mode === "new-page")}>
            새 페이지
          </button>
          <button onClick={() => setMode("append")} className={TAB_CLASSES(mode === "append")}>
            기존에 추가
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 space-y-3">
          {mode === "new-folder-page" && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">폴더 이름</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="예: 학습 노트"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">페이지 이름</label>
                <input
                  type="text"
                  value={newPageName1}
                  onChange={(e) => setNewPageName1(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
                  placeholder="예: 1단원 요약"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </>
          )}

          {mode === "new-page" && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">폴더 선택 (선택 사항)</label>
                <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-1">
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2 ${
                      selectedFolderId === null ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                    최상위 (폴더 없음)
                  </button>
                  {folders.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">폴더 없음</p>
                  ) : (
                    folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2 ${
                          selectedFolderId === f.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                        {f.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">페이지 이름</label>
                <input
                  type="text"
                  value={newPageName2}
                  onChange={(e) => setNewPageName2(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
                  placeholder="예: 1단원 요약"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </>
          )}

          {mode === "append" && (
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">기존 페이지 선택</label>
              {recentPages.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  저장된 페이지가 없습니다.<br />
                  <button onClick={() => setMode("new-page")} className="mt-1 text-blue-600 underline">
                    새 페이지로 저장
                  </button>
                </p>
              ) : (
                <div className="space-y-1">
                  {nodes
                    .filter((n) => n.type === "page")
                    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
                    .map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setAppendNodeId(page.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2.5 ${
                          appendNodeId === page.id
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <svg
                          className={`w-3.5 h-3.5 shrink-0 ${appendNodeId === page.id ? "text-blue-500" : "text-blue-300"}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${appendNodeId === page.id ? "text-blue-700" : "text-gray-700"}`}>
                            {page.name}
                          </p>
                          {page.content && (
                            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                              {page.content.replace(/<[^>]+>/g, "").trim().slice(0, 60)}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Recent files shortcut */}
          {mode !== "append" && recentPages.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">최근 파일에 바로 추가</p>
              <div className="space-y-1">
                {recentPages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => { setAppendNodeId(page.id); setMode("append"); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2.5 group"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-gray-600 truncate group-hover:text-gray-800">{page.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === "append" ? "추가하기" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
