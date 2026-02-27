"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UNITS } from "@/lib/types";

function SetupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const level = (searchParams.get("level") as "A1" | "A2") ?? "A1";

  const [activeBand, setActiveBand] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  const bands = Array.from(new Set(UNITS.map((u) => u.band))).sort((a, b) => a - b);
  const unitsForBand = UNITS.filter((u) => u.band === activeBand);

  const handleStart = () => {
    if (!selectedUnit) return;
    localStorage.setItem("lingua_unit", selectedUnit);
    localStorage.setItem("lingua_level", level);
    router.push(`/chat?unit=${selectedUnit}&level=${level}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 transition-colors"
        >
          ← 뒤로
        </button>
        <span className="text-sm font-medium text-gray-900">
          교재 선택 ({level})
        </span>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full p-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">독독독 {level}</p>

        {/* Band tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {bands.map((band) => (
            <button
              key={band}
              onClick={() => setActiveBand(band)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeBand === band
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Band {band}
            </button>
          ))}
        </div>

        {/* Unit radio list */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {unitsForBand.map((unit) => (
            <label
              key={unit.id}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedUnit === unit.id ? "bg-blue-50" : ""
              }`}
            >
              <input
                type="radio"
                name="unit"
                value={unit.id}
                checked={selectedUnit === unit.id}
                onChange={() => setSelectedUnit(unit.id)}
                className="accent-blue-600 shrink-0"
              />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-400 shrink-0">{unit.id}</span>
                <span className="text-sm text-gray-800 truncate">{unit.title}</span>
              </div>
            </label>
          ))}
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!selectedUnit}
          className="mt-6 w-full py-3 rounded-xl bg-blue-600 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          학습 시작
        </button>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}
