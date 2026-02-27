"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Returning users: skip onboarding and go straight to chat
  useEffect(() => {
    const savedUnit = localStorage.getItem("lingua_unit");
    const savedLevel = localStorage.getItem("lingua_level");
    if (savedUnit && savedLevel) {
      router.replace(`/chat?unit=${savedUnit}&level=${savedLevel}`);
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">LinguaRAG</h1>
        <p className="text-gray-500 text-sm">AI와 함께하는 독일어 학습</p>
      </div>

      <p className="text-gray-700 font-medium mb-6">당신의 독일어 레벨은?</p>

      <div className="flex gap-4">
        <button
          onClick={() => router.push("/setup?level=A1")}
          className="w-44 h-36 rounded-2xl border-2 border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm"
        >
          <span className="text-2xl font-bold text-blue-700">A1</span>
          <span className="text-sm text-gray-500">입문/초급</span>
        </button>

        <button
          disabled
          className="w-44 h-36 rounded-2xl border-2 border-gray-200 bg-white flex flex-col items-center justify-center gap-2 opacity-50 cursor-not-allowed"
        >
          <span className="text-2xl font-bold text-gray-400">A2</span>
          <span className="text-sm text-gray-400">초급/중급</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            준비 중
          </span>
        </button>
      </div>
    </div>
  );
}
