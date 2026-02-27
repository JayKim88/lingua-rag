"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ChatPanel from "@/components/ChatPanel";
import { UNITS } from "@/lib/types";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { createClient } from "@/lib/supabase/client";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const unitParam = searchParams.get("unit");
  const levelParam = searchParams.get("level") as "A1" | "A2" | null;

  const [initialized, setInitialized] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>("A1-1");
  const [level, setLevel] = useState<"A1" | "A2">("A1");
  const [visitedUnits, setVisitedUnits] = useState<Set<string>>(new Set());

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const healthStatus = useBackendHealth();

  // Initialize from URL params or localStorage (run once on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedUnit = localStorage.getItem("lingua_unit");
    const savedLevel = localStorage.getItem("lingua_level") as "A1" | "A2" | null;
    const unit = unitParam ?? savedUnit ?? "A1-1";
    const lvl = levelParam ?? savedLevel ?? "A1";
    setSelectedUnit(unit);
    setLevel(lvl as "A1" | "A2");
    setVisitedUnits(new Set([unit]));
    setInitialized(true);
  }, []);

  // Persist to localStorage on unit/level change
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem("lingua_unit", selectedUnit);
    localStorage.setItem("lingua_level", level);
  }, [selectedUnit, level, initialized]);

  // Sidebar drag-to-resize
  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - dragStartX.current;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartWidth.current + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const currentUnit = UNITS.find((u) => u.id === selectedUnit);
  const textbookId = level === "A2" ? "dokdokdok-a2" : "dokdokdok-a1";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem("lingua_unit");
    localStorage.removeItem("lingua_level");
    router.push("/login");
  };

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnit(unitId);
    setVisitedUnits((prev) => {
      if (prev.has(unitId)) return prev;
      return new Set([...prev, unitId]);
    });
  };

  return (
    <div
      className={`flex h-screen bg-gray-50 flex-col${isResizing ? " select-none cursor-col-resize" : ""}`}
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

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="bg-white border-r border-gray-200 flex flex-col shrink-0"
          style={{ width: sidebarWidth }}
        >
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-900">LinguaRAG</h1>
            <p className="text-xs text-gray-500 mt-0.5">독독독 {level} · 독일어 학습</p>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((band) => {
              const bandUnits = UNITS.filter((u) => u.band === band);
              if (bandUnits.length === 0) return null;
              const bandName = bandUnits[0]?.band_name ?? "";
              return (
                <div key={band} className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 px-2 mb-1">
                    Band {band} · {bandName}
                  </p>
                  {bandUnits.map((unit) => (
                    <button
                      key={unit.id}
                      onClick={() => handleSelectUnit(unit.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-1 ${
                        selectedUnit === unit.id
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-xs text-gray-400 mr-1 shrink-0">
                        {unit.id}
                      </span>
                      <span className="flex-1 truncate">{unit.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="p-3 border-t border-gray-100 flex flex-col gap-1">
            <button
              onClick={() => {
                localStorage.removeItem("lingua_unit");
                localStorage.removeItem("lingua_level");
                router.push("/");
              }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 transition-colors text-left px-1"
            >
              ← 레벨 재선택
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-xs text-gray-400 hover:text-red-500 py-1.5 transition-colors text-left px-1"
            >
              로그아웃
            </button>
          </div>
        </aside>

        {/* Drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className={`w-1 shrink-0 cursor-col-resize transition-colors ${
            isResizing ? "bg-blue-400" : "bg-gray-200 hover:bg-blue-300"
          }`}
        />

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {currentUnit?.title ?? "단원 선택"}
                </h2>
                <p className="text-xs text-gray-500">
                  {currentUnit?.topics.join(" · ") ?? ""}
                </p>
              </div>
              <span className="ml-auto text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {level}
              </span>
            </div>
          </header>

          {/* Persistent chat panels — mounted on first visit, never unmounted */}
          {initialized &&
            UNITS.filter((u) => visitedUnits.has(u.id)).map((unit) => (
              <div
                key={unit.id}
                className="flex-1 flex flex-col overflow-hidden"
                style={{ display: unit.id === selectedUnit ? undefined : "none" }}
              >
                <ChatPanel
                  unitId={unit.id}
                  level={level}
                  textbookId={textbookId}
                />
              </div>
            ))}
        </main>
      </div>
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
