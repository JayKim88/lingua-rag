"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

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

// Language-aware symbol → word expansion before stripping non-letters
const SYMBOL_MAP: Record<string, Record<string, string>> = {
  "%": {
    "de-DE": "prozent", "de-AT": "prozent", "de-CH": "prozent",
    "en-US": "percent", "en-GB": "percent",
    "fr-FR": "pour cent",
    "es-ES": "por ciento",
    "it-IT": "percento",
    "pt-BR": "por cento",
    "ja-JP": "パーセント",
    "zh-CN": "百分之",
  },
  "€": { default: "euro" },
  "$": {
    "en-US": "dollar", "en-GB": "dollar", "pt-BR": "dólar",
    "es-ES": "dólar", "it-IT": "dollaro", "fr-FR": "dollar",
    "de-DE": "dollar", "de-AT": "dollar", "de-CH": "dollar",
    default: "dollar",
  },
  "£": { default: "pound" },
  "¥": { "ja-JP": "えん", "zh-CN": "元", default: "yen" },
};

function expandSymbols(s: string, lang: string): string {
  let result = s;
  for (const [sym, map] of Object.entries(SYMBOL_MAP)) {
    const word = map[lang] ?? map["default"] ?? Object.values(map)[0];
    result = result.replace(new RegExp(sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), ` ${word} `);
  }
  return result;
}

function normalize(s: string, lang = "en-US"): string[] {
  return expandSymbols(s, lang)
    .toLowerCase()
    // Keep digits as tokens alongside letters
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Basic number-word lookup for STT word→digit matching (STT often returns digits)
const NUMBER_WORDS: Record<string, Record<string, number>> = {
  "de-DE": { null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90, hundert: 100 },
  "en-US": { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 },
  "fr-FR": { zéro: 0, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100 },
  "es-ES": { cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 },
  "it-IT": { zero: 0, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90, cento: 100 },
  "pt-BR": { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 },
  "ja-JP": { ゼロ: 0, れい: 0, いち: 1, に: 2, さん: 3, し: 4, よん: 4, ご: 5, ろく: 6, なな: 7, しち: 7, はち: 8, きゅう: 9, く: 9, じゅう: 10, にじゅう: 20, さんじゅう: 30, よんじゅう: 40, ごじゅう: 50, ろくじゅう: 60, ななじゅう: 70, はちじゅう: 80, きゅうじゅう: 90, ひゃく: 100 },
  "zh-CN": { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 二十: 20, 三十: 30, 四十: 40, 五十: 50, 六十: 60, 七十: 70, 八十: 80, 九十: 90, 百: 100 },
  "ko-KR": { 영: 0, 공: 0, 일: 1, 하나: 1, 이: 2, 둘: 2, 삼: 3, 셋: 3, 사: 4, 넷: 4, 오: 5, 다섯: 5, 육: 6, 여섯: 6, 칠: 7, 일곱: 7, 팔: 8, 여덟: 8, 구: 9, 아홉: 9, 십: 10, 이십: 20, 삼십: 30, 사십: 40, 오십: 50, 육십: 60, 칠십: 70, 팔십: 80, 구십: 90, 백: 100 },
};
NUMBER_WORDS["en-GB"] = NUMBER_WORDS["en-US"];
NUMBER_WORDS["de-AT"] = NUMBER_WORDS["de-DE"];
NUMBER_WORDS["de-CH"] = NUMBER_WORDS["de-DE"];

// Match a recognized word against an expected token, handling digit↔word equivalence
function numericMatch(recognized: string, expected: string, lang: string): boolean {
  if (recognized === expected) return true;
  const map = NUMBER_WORDS[lang];
  if (!map) return false;
  // recognized is a word, expected is a digit
  if (/^\d+$/.test(expected) && map[recognized] !== undefined)
    return map[recognized] === Number(expected);
  // recognized is a digit, expected is a word
  if (/^\d+$/.test(recognized) && map[expected] !== undefined)
    return Number(recognized) === map[expected];
  return false;
}

function fuzzyMatch(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const threshold = maxLen <= 3 ? 1 : maxLen <= 6 ? 2 : 3;
  return levenshtein(a, b) <= threshold;
}

// ---------------------------------------------------------------------------
// PronunciationModal
// ---------------------------------------------------------------------------
export default function PronunciationModal({ text, speak, onClose, lang = "en-US" }: Props) {
  const origWords = useMemo(() => normalize(text, lang), [text, lang]);

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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const playDing = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      // "띵" — warm high note
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine";
      o1.frequency.value = 784;
      g1.gain.setValueAtTime(0.2, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      o1.connect(g1).connect(ctx.destination);
      o1.start(now);
      o1.stop(now + 0.2);

      // "똥" — soft lower note
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.value = 523.25;
      g2.gain.setValueAtTime(0.2, now + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      o2.connect(g2).connect(ctx.destination);
      o2.start(now + 0.12);
      o2.stop(now + 0.4);
    } catch {
      // AudioContext not available — skip silently
    }
  }, []);

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
      const newWords = normalize(t, lang);
      const prev = prevTransWordsRef.current;
      let current = matchedCountRef.current;
      let wrongWord = false;

      if (newWords.length > prev.length) {
        // Delta: process only newly added words
        for (const word of newWords.slice(prev.length)) {
          const expected = origWords[current];
          if (!expected) break;
          if (fuzzyMatch(word, expected) || numericMatch(word, expected, lang)) {
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
          if (fuzzyMatch(newWords[i], expected) || numericMatch(newWords[i], expected, lang)) current++;
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
        // ✓ Full sentence matched — pause recognition immediately
        phaseRef.current = "done"; // set before stop() so onend doesn't re-trigger
        recRef.current?.stop();

        // Delay success UI so the last chip renders green first
        setTimeout(() => {
          if (!mountedRef.current) return;
          const newPass = passCountRef.current + 1;
          passCountRef.current = newPass;
          setPassCount(newPass);
          playDing();

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
        }, 500);
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
      audioCtxRef.current?.close().catch(() => {});
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
