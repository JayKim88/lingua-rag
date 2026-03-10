"use client";

import { useState, useRef, useEffect, useMemo } from "react";

interface Props {
  text: string;
  speak: (t: string) => void;
  onClose: () => void;
  lang?: string;
}

type Phase = "listening" | "done" | "complete";

const REQUIRED_PASSES = 10;
const AUTO_ADVANCE_MS = 1500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function fuzzyMatch(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const threshold = maxLen <= 3 ? 1 : maxLen <= 6 ? 2 : 3;
  return levenshtein(a, b) <= threshold;
}

// ---------------------------------------------------------------------------
// PronunciationModal
// ---------------------------------------------------------------------------
export default function PronunciationModal({ text, speak, onClose, lang = "de-DE" }: Props) {
  const origWords = useMemo(() => normalize(text), [text]);

  const [phase, setPhase] = useState<Phase>("listening");
  const [matchedCount, setMatchedCount] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [transcript, setTranscript] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const matchedCountRef = useRef(0);
  const passCountRef = useRef(0);
  const phaseRef = useRef<Phase>("listening");
  const prevTransWordsRef = useRef<string[]>([]);
  const isNewSessionRef = useRef(true);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set to false in cleanup; used to cancel deferred restarts after unmount
  const mountedRef = useRef(true);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const clearAutoAdvanceTimer = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  const startListening = () => {
    if (!isSupported || !mountedRef.current) return;

    isNewSessionRef.current = true;
    prevTransWordsRef.current = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Rec = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new Rec();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      phaseRef.current = "listening";
      setPhase("listening");
      setTranscript("");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // Ignore stale results that arrive after a successful match or wrong-word reset
      if (phaseRef.current !== "listening") return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      setTranscript(t);
      const newWords = normalize(t);
      const prev = prevTransWordsRef.current;
      let current = matchedCountRef.current;
      let wrongWord = false;

      if (newWords.length > prev.length) {
        // Delta: process only newly added words
        for (const word of newWords.slice(prev.length)) {
          const expected = origWords[current];
          if (!expected) break;
          if (fuzzyMatch(word, expected)) {
            current++;
            isNewSessionRef.current = false;
          } else if (current > 0 && !isNewSessionRef.current) {
            // Don't reset when expecting the last word — STT often garbles proper nouns.
            // Let the session end naturally and restart; the user can retry just the last word.
            if (current < origWords.length - 1) {
              wrongWord = true;
              current = 0;
            }
            break;
          }
          // current === 0 or new session: skip unmatched word, keep waiting
        }
      } else {
        // STT revised earlier text → strict sequential recompute from start
        current = 0;
        for (let i = 0; i < newWords.length; i++) {
          const expected = origWords[current];
          if (!expected) break;
          if (fuzzyMatch(newWords[i], expected)) current++;
          else break;
        }
      }

      prevTransWordsRef.current = newWords;
      matchedCountRef.current = current;
      setMatchedCount(current);

      if (wrongWord) {
        // Mark phase as non-listening so onend doesn't double-restart
        phaseRef.current = "done";
        matchedCountRef.current = 0;
        setMatchedCount(0);
        prevTransWordsRef.current = [];
        recRef.current?.stop();
        // Restart after brief reset
        autoAdvanceTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          matchedCountRef.current = 0;
          prevTransWordsRef.current = [];
          setMatchedCount(0);
          startListening();
        }, 400);
        return;
      }

      if (current >= origWords.length) {
        // ✓ Full sentence matched — success
        phaseRef.current = "done"; // set before stop() so onend doesn't re-trigger
        recRef.current?.stop();

        const newPass = passCountRef.current + 1;
        passCountRef.current = newPass;
        setPassCount(newPass);

        if (newPass >= REQUIRED_PASSES) {
          phaseRef.current = "complete";
          setPhase("complete");
        } else {
          setPhase("done");
          autoAdvanceTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            matchedCountRef.current = 0;
            prevTransWordsRef.current = [];
            setMatchedCount(0);
            startListening();
          }, AUTO_ADVANCE_MS);
        }
      }
    };

    rec.onerror = (e: { error: string }) => {
      // Ignore events from stale instances
      if (rec !== recRef.current) return;
      // no-speech and aborted are handled by onend restarting
      if (e.error === "no-speech" || e.error === "aborted") return;
      // Permission denied — stop silently, don't loop
      if (e.error === "not-allowed") return;
    };

    rec.onend = () => {
      // Ignore events from stale instances
      if (rec !== recRef.current) return;
      // Only auto-restart when still in listening phase (not success/complete/wrongWord-reset)
      if (phaseRef.current !== "listening") return;
      setTimeout(() => {
        if (!mountedRef.current) return;
        if (rec !== recRef.current) return;
        startListening();
      }, 100);
    };

    recRef.current = rec;
    rec.start();
  };

  // Auto-start on mount + full cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    if (isSupported) startListening();
    return () => {
      mountedRef.current = false;
      clearAutoAdvanceTimer();
      const dying = recRef.current;
      recRef.current = null; // invalidate so stale onend/onerror guards fire
      dying?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Stop mic while TTS plays, restart when done
  const handleSpeak = () => {
    // Set phase to "done" BEFORE abort so onend doesn't auto-restart and pick up TTS audio
    phaseRef.current = "done";
    recRef.current?.abort();
    speak(text);
    const waitAndRestart = () => {
      // Guard: component may have unmounted while TTS was playing
      if (!mountedRef.current) return;
      if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
        setTimeout(waitAndRestart, 300);
        return;
      }
      // Don't restart if practice is already complete
      if (passCountRef.current < REQUIRED_PASSES) startListening();
    };
    setTimeout(waitAndRestart, 500);
  };

  const chips = origWords.map((word, i) => ({ word, matched: i < matchedCount }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">발음 연습</h2>
            {phase !== "complete" && (
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {passCount} / {REQUIRED_PASSES}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress gauge */}
        {phase !== "complete" && (
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(passCount / REQUIRED_PASSES) * 100}%` }}
            />
          </div>
        )}

        {/* Target sentence */}
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">목표 문장</p>
          <p className="text-sm font-medium text-gray-800 leading-relaxed">{text}</p>
          <button
            onClick={handleSpeak}
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            듣기
          </button>
        </div>

        {/* Unsupported browser */}
        {!isSupported && (
          <div className="text-center py-4 text-xs text-gray-400">
            이 브라우저는 음성 인식을 지원하지 않습니다.
            <br />
            Chrome을 사용해 주세요.
          </div>
        )}

        {/* Listening */}
        {isSupported && phase === "listening" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              인식 중...
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {chips.map((w, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors duration-200 ${
                    w.matched
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {w.matched ? "✓" : "○"} {w.word}
                </span>
              ))}
            </div>
            {transcript && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                {transcript}
              </p>
            )}
          </div>
        )}

        {/* Done — success display (auto-advances) */}
        {phase === "done" && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-green-50">
            <span className="text-xs text-gray-500">결과</span>
            <span className="text-sm font-bold text-green-600">
              ✓ 성공 — 잠시 후 계속...
            </span>
          </div>
        )}

        {/* Complete */}
        {phase === "complete" && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="text-4xl">🎉</div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-800">완벽해요!</p>
              <p className="text-xs text-gray-400 mt-1">
                {REQUIRED_PASSES}번 성공했습니다
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
