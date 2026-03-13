"use client";

import { useState, useMemo } from "react";
import { type TreeNode } from "@/lib/tree";

export type SaveMode = "new-folder-page" | "new-page" | "append";

export type PageSaveResult =
  | { mode: "new-folder-page"; folderName: string; pageName: string; content: string }
  | { mode: "new-page"; parentId: string | null; pageName: string; content: string }
  | { mode: "append"; nodeId: string; content: string };

type Tab = "note" | "page";

interface SummarySaveModalProps {
  content: string;
  nodes: TreeNode[];
  hasNoteOption: boolean;
  onSaveToNote: (text: string) => void;
  onSaveToPage: (result: PageSaveResult) => void;
  onClose: () => void;
}

export default function SummarySaveModal({
  content,
  nodes,
  hasNoteOption,
  onSaveToNote,
  onSaveToPage,
  onClose,
}: SummarySaveModalProps) {
  const [tab, setTab] = useState<Tab>(hasNoteOption ? "note" : "page");

  // ── Note tab state ──
  const [noteText, setNoteText] = useState(content);

  // ── Page tab state ──
  const [pageText, setPageText] = useState(content);
  const [pageMode, setPageMode] = useState<SaveMode>("new-page");

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

  const [newFolderName, setNewFolderName] = useState("");
  const [newPageName1, setNewPageName1] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folders[0]?.id ?? null);
  const [newPageName2, setNewPageName2] = useState("");
  const [appendNodeId, setAppendNodeId] = useState<string | null>(recentPages[0]?.id ?? null);

  const canSavePage = (() => {
    if (!pageText.trim()) return false;
    if (pageMode === "new-folder-page") return newFolderName.trim().length > 0 && newPageName1.trim().length > 0;
    if (pageMode === "new-page") return newPageName2.trim().length > 0;
    return appendNodeId !== null;
  })();

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    onSaveToNote(noteText.trim());
  };

  const handleSavePage = () => {
    if (!canSavePage) return;
    const c = pageText.trim();
    if (pageMode === "new-folder-page") {
      onSaveToPage({ mode: pageMode, folderName: newFolderName.trim(), pageName: newPageName1.trim(), content: c });
    } else if (pageMode === "new-page") {
      onSaveToPage({ mode: pageMode, parentId: selectedFolderId, pageName: newPageName2.trim(), content: c });
    } else {
      onSaveToPage({ mode: "append", nodeId: appendNodeId!, content: c });
    }
  };

  const TAB = (active: boolean) =>
    `flex-1 text-xs py-2 font-medium transition-colors ${
      active ? "text-blue-700 border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-600"
    }`;

  const PAGE_MODE_TAB = (active: boolean) =>
    `flex-1 text-xs py-1.5 rounded-md border transition-colors font-medium ${
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
          <h3 className="text-sm font-semibold text-gray-900">요약 저장하기</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 shrink-0">
          {hasNoteOption && (
            <button onClick={() => setTab("note")} className={TAB(tab === "note")}>
              현재 페이지 노트에 저장
            </button>
          )}
          <button onClick={() => setTab("page")} className={TAB(tab === "page")}>
            페이지에 저장
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Note tab ── */}
          {tab === "note" && (
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">저장할 내용</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="메모를 작성하세요..."
                  className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSaveNote();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={!noteText.trim()}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장
                </button>
              </div>
            </div>
          )}

          {/* ── Page tab ── */}
          {tab === "page" && (
            <div className="px-5 py-4 space-y-3">
              {/* Editable content */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">저장할 내용</label>
                <textarea
                  value={pageText}
                  onChange={(e) => setPageText(e.target.value)}
                  placeholder="저장할 내용을 입력하세요..."
                  className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-gray-400"
                  autoFocus={!hasNoteOption}
                />
              </div>

              {/* Page mode toggle */}
              <div className="flex gap-1">
                <button onClick={() => setPageMode("new-folder-page")} className={PAGE_MODE_TAB(pageMode === "new-folder-page")}>
                  새 폴더 + 페이지
                </button>
                <button onClick={() => setPageMode("new-page")} className={PAGE_MODE_TAB(pageMode === "new-page")}>
                  새 페이지
                </button>
                <button onClick={() => setPageMode("append")} className={PAGE_MODE_TAB(pageMode === "append")}>
                  기존에 추가
                </button>
              </div>

              {/* Page mode body */}
              {pageMode === "new-folder-page" && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">폴더 이름</label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="예: 학습 노트"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">페이지 이름</label>
                    <input
                      type="text"
                      value={newPageName1}
                      onChange={(e) => setNewPageName1(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePage(); if (e.key === "Escape") onClose(); }}
                      placeholder="예: 1단원 요약"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {pageMode === "new-page" && (
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
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePage(); if (e.key === "Escape") onClose(); }}
                      placeholder="예: 1단원 요약"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {pageMode === "append" && (
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">기존 페이지 선택</label>
                  {recentPages.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                      저장된 페이지가 없습니다.<br />
                      <button onClick={() => setPageMode("new-page")} className="mt-1 text-blue-600 underline">
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
              {pageMode !== "append" && recentPages.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">최근 파일에 바로 추가</p>
                  <div className="space-y-1">
                    {recentPages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => { setAppendNodeId(page.id); setPageMode("append"); }}
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

              {/* Footer */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSavePage}
                  disabled={!canSavePage}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pageMode === "append" ? "추가하기" : "만들기"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
