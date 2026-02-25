"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import { UNITS } from "@/lib/types";

export default function Home() {
  const [selectedUnit, setSelectedUnit] = useState<string>("A1-1");
  const [level] = useState<"A1" | "A2">("A1");

  const currentUnit = UNITS.find((u) => u.id === selectedUnit);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">LinguaRAG</h1>
          <p className="text-xs text-gray-500 mt-0.5">독독독 A1 · 독일어 학습</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {Array.from({ length: 6 }, (_, i) => i + 1).map((band) => {
            const bandUnits = UNITS.filter((u) => u.band === band);
            if (bandUnits.length === 0) return null;
            return (
              <div key={band} className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-1">
                  Band {band}
                </p>
                {bandUnits.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => setSelectedUnit(unit.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedUnit === unit.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-xs text-gray-400 mr-1">{unit.id}</span>
                    {unit.title}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Unit header */}
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

        {/* Chat */}
        <ChatPanel
          unitId={selectedUnit}
          level={level}
          textbookId="dokdokdok-a1"
        />
      </main>
    </div>
  );
}