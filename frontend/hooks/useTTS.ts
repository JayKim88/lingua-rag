"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Priority-ordered list of German voices. Google Deutsch is the default.
const PREFERRED_VOICE_NAMES = [
  "Google Deutsch",          // Chrome — default
  "Anna",                    // macOS Safari — neural
  "Microsoft Katja Online",  // Edge — neural
  "Microsoft Hedda Online",  // Edge — neural
  "Petra",                   // macOS alternative
  "Yannick",                 // macOS (de-DE)
  "Markus",                  // macOS (de-DE)
];

function pickBestGermanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const german = voices.filter((v) => v.lang.startsWith("de"));
  if (german.length === 0) return null;

  for (const name of PREFERRED_VOICE_NAMES) {
    const match = german.find((v) => v.name.includes(name));
    if (match) return match;
  }

  const network = german.find((v) => !v.localService);
  if (network) return network;

  return german[0];
}

function loadSetting(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useTTS() {
  const [volume, setVolumeState] = useState(() => loadSetting("tts_volume", 0.8));
  const [rate, setRateState] = useState(() => loadSetting("tts_rate", 0.9));
  const [isSpeaking, setIsSpeaking] = useState(false);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    try { localStorage.setItem("tts_volume", String(v)); } catch { /* ignore */ }
  }, []);

  const setRate = useCallback((v: number) => {
    setRateState(v);
    try { localStorage.setItem("tts_rate", String(v)); } catch { /* ignore */ }
  }, []);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const select = () => {
      voiceRef.current = pickBestGermanVoice();
    };

    select();
    window.speechSynthesis.addEventListener("voiceschanged", select);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", select);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "de-DE";
      utterance.volume = volume;
      utterance.rate = rate;

      const voice = voiceRef.current ?? pickBestGermanVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [volume, rate]
  );

  return { speak, volume, setVolume, rate, setRate, isSpeaking };
}
