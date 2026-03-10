"use client";

import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import { type TreeNode } from "@/lib/tree";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Toolbar helpers ────────────────────────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focused
        onClick();
      }}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

const TBDivider = () => (
  <div className="w-px h-4 bg-gray-200 mx-0.5 shrink-0" />
);

// ── Icons ──────────────────────────────────────────────────────────────────

const IconEdit = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────

interface PageViewerProps {
  node: TreeNode;
  onUpdate: (nodeId: string, changes: { name?: string; content?: string }) => void;
  onEditingChange?: (editing: boolean) => void;
  saveRef?: { current: (() => void) | null };
}

export default function PageViewer({ node, onUpdate, onEditingChange, saveRef }: PageViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(node.name);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Typography,
      Placeholder.configure({ placeholder: "내용을 입력하세요..." }),
    ],
    content: node.content ?? "",
    editable: false,
    editorProps: {
      attributes: { class: "tiptap-content outline-none min-h-[200px]" },
    },
  });

  // Sync content when node changes externally
  useEffect(() => {
    if (!editor || isEditing) return;
    editor.commands.setContent(node.content ?? "");
  }, [node.id, node.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle editable mode + notify parent
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditing);
    if (isEditing) setTimeout(() => editor.commands.focus("end"), 30);
    onEditingChange?.(isEditing);
  }, [isEditing, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    if (!editor) return;
    const name = draftName.trim() || node.name;
    const content = editor.getHTML();
    onUpdate(node.id, { name, content });
    setIsEditing(false);
  }, [editor, draftName, node.name, node.id, onUpdate]);

  // Keep saveRef current so parent can trigger save programmatically
  if (saveRef) saveRef.current = isEditing ? handleSave : null;

  const handleEdit = useCallback(() => {
    setDraftName(node.name);
    setIsEditing(true);
  }, [node.name]);

  const handleCancel = useCallback(() => {
    editor?.commands.setContent(node.content ?? "");
    setDraftName(node.name);
    setIsEditing(false);
  }, [editor, node.content, node.name]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="border-b border-gray-100 px-6 py-3 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
                className="w-full text-lg font-semibold text-gray-800 outline-none border-b-2 border-blue-300 focus:border-blue-500 pb-0.5 bg-transparent"
                placeholder="페이지 이름"
              />
            ) : (
              <h1 className="text-xl font-semibold text-gray-900 leading-tight break-words">
                {node.name}
              </h1>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
              <span>생성 {formatDate(node.createdAt)}</span>
              {node.updatedAt && node.updatedAt !== node.createdAt && (
                <>
                  <span className="text-gray-200">·</span>
                  <span>수정 {formatDate(node.updatedAt)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  저장
                </button>
              </>
            ) : (
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <IconEdit />
                편집하기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar (edit mode only) ── */}
      {isEditing && editor && (
        <div className="border-b border-gray-100 px-4 py-1.5 flex flex-wrap items-center gap-0.5 bg-gray-50 shrink-0">
          {/* Headings */}
          <ToolbarBtn
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="제목 1"
          >H1</ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="제목 2"
          >H2</ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="제목 3"
          >H3</ToolbarBtn>

          <TBDivider />

          {/* Inline formatting */}
          <ToolbarBtn
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="굵게 (⌘B)"
          ><strong>B</strong></ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="기울임 (⌘I)"
          ><em>I</em></ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="밑줄 (⌘U)"
          ><span className="underline">U</span></ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="취소선"
          ><s>S</s></ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="인라인 코드"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </ToolbarBtn>

          <TBDivider />

          {/* Lists */}
          <ToolbarBtn
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="글머리 기호 목록"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="번호 목록"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="인용구"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
            </svg>
          </ToolbarBtn>

          <TBDivider />

          {/* Block elements */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="구분선"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="코드 블록"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolbarBtn>

          <TBDivider />

          {/* History */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            title="되돌리기 (⌘Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a7 7 0 010 14H3m0-14l4-4M3 10l4 4" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            title="다시실행 (⌘⇧Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a7 7 0 000 14h10m0-14l-4-4m4 4l-4 4" />
            </svg>
          </ToolbarBtn>
        </div>
      )}

      {/* ── Editor / viewer content ── */}
      <div
        className="flex-1 overflow-y-auto px-6 py-5"
        onClick={() => { if (!isEditing && !node.content) handleEdit(); }}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          !node.content && (
            <p className="text-sm text-gray-300 italic">내용이 없습니다. 편집하기를 클릭하세요.</p>
          )
        )}
      </div>
    </div>
  );
}
