"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface TtsLanguage {
  code: string;   // BCP-47 (e.g. "de-DE")
  name: string;   // native name
  flag: string;   // emoji flag
  label: string;  // Korean label
}

export const TTS_LANGUAGES: TtsLanguage[] = [
  { code: "de-DE", name: "Deutsch",        flag: "🇩🇪", label: "독일어" },
  { code: "en-US", name: "English (US)",   flag: "🇺🇸", label: "영어 (미국)" },
  { code: "en-GB", name: "English (UK)",   flag: "🇬🇧", label: "영어 (영국)" },
  { code: "fr-FR", name: "Français",       flag: "🇫🇷", label: "프랑스어" },
  { code: "es-ES", name: "Español",        flag: "🇪🇸", label: "스페인어" },
  { code: "it-IT", name: "Italiano",       flag: "🇮🇹", label: "이탈리아어" },
  { code: "ja-JP", name: "日本語",          flag: "🇯🇵", label: "일본어" },
  { code: "zh-CN", name: "中文",            flag: "🇨🇳", label: "중국어" },
  { code: "pt-BR", name: "Português (BR)", flag: "🇧🇷", label: "포르투갈어" },
];

function pickBestVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefix = langCode.split("-")[0];
  const exact = voices.filter((v) => v.lang === langCode);
  const loose = voices.filter((v) => v.lang.startsWith(prefix));
  const pool = exact.length > 0 ? exact : loose;
  if (pool.length === 0) return null;
  const network = pool.find((v) => !v.localService);
  return network ?? pool[0];
}

function loadSetting(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

function loadLanguage(): string | null {
  try {
    return localStorage.getItem("tts_language") ?? null;
  } catch {
    return null;
  }
}

export function useTTS() {
  const [volume, setVolumeState] = useState(() => loadSetting("tts_volume", 0.8));
  const [rate, setRateState] = useState(() => loadSetting("tts_rate", 0.9));
  const [language, setLanguageState] = useState<string | null>(loadLanguage);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    try { localStorage.setItem("tts_volume", String(v)); } catch { /* ignore */ }
  }, []);

  const setRate = useCallback((v: number) => {
    setRateState(v);
    try { localStorage.setItem("tts_rate", String(v)); } catch { /* ignore */ }
  }, []);

  const setLanguage = useCallback((lang: string | null) => {
    setLanguageState(lang);
    try {
      if (lang) localStorage.setItem("tts_language", lang);
      else localStorage.removeItem("tts_language");
    } catch { /* ignore */ }
  }, []);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis || !language) return;

    const select = () => {
      voiceRef.current = pickBestVoice(language);
    };

    select();
    window.speechSynthesis.addEventListener("voiceschanged", select);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", select);
  }, [language]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (!language) return; // 언어 미선택 시 재생 안 함

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.volume = volume;
      utterance.rate = rate;

      const voice = voiceRef.current ?? pickBestVoice(language);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [language, volume, rate]
  );

  const speakWithOptions = useCallback(
    (text: string, opts: { volume?: number; rate?: number }) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (!language) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.volume = opts.volume ?? volume;
      utterance.rate = opts.rate ?? rate;

      const voice = voiceRef.current ?? pickBestVoice(language);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [language, volume, rate]
  );

  return { speak, speakWithOptions, volume, setVolume, rate, setRate, language, setLanguage, isSpeaking };
}
