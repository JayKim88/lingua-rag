"use client";

import { useState, useCallback } from "react";

export function useTTS() {
  const [volume, setVolume] = useState(0.8);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "de-DE";
      utterance.volume = volume;
      utterance.rate = 0.85;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [volume]
  );

  return { speak, volume, setVolume, isSpeaking };
}
