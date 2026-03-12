"""
Lightweight language detection from text samples.

Uses Unicode script analysis + high-frequency word matching to identify the
dominant language of a PDF. Returns a BCP-47 code (e.g. "de-DE") compatible
with the TTS_LANGUAGES list on the frontend.

No external dependencies — pure Python stdlib.
"""

import re
from collections import Counter

# BCP-47 codes matching frontend TTS_LANGUAGES
_LANG_CODES = {
    "de": "de-DE",
    "en": "en-US",
    "fr": "fr-FR",
    "es": "es-ES",
    "it": "it-IT",
    "ja": "ja-JP",
    "zh": "zh-CN",
    "pt": "pt-BR",
}

# High-frequency function words per language (top ~20 each).
# These are deliberately common words that appear in almost any text.
_WORD_LISTS: dict[str, set[str]] = {
    "de": {
        "der",
        "die",
        "das",
        "und",
        "ist",
        "ein",
        "eine",
        "nicht",
        "den",
        "dem",
        "sich",
        "auf",
        "mit",
        "für",
        "von",
        "sind",
        "auch",
        "als",
        "aber",
        "noch",
        "nach",
        "bei",
        "nur",
        "wie",
        "oder",
        "wenn",
    },
    "en": {
        "the",
        "and",
        "is",
        "in",
        "to",
        "of",
        "that",
        "it",
        "for",
        "was",
        "on",
        "are",
        "with",
        "as",
        "his",
        "they",
        "be",
        "at",
        "this",
        "from",
        "have",
        "not",
        "but",
        "had",
        "by",
        "an",
        "which",
        "you",
        "were",
    },
    "fr": {
        "le",
        "la",
        "les",
        "de",
        "des",
        "un",
        "une",
        "est",
        "et",
        "en",
        "que",
        "qui",
        "dans",
        "pour",
        "pas",
        "sur",
        "ce",
        "par",
        "au",
        "avec",
        "son",
        "sont",
        "cette",
        "mais",
        "ou",
        "plus",
        "tout",
    },
    "es": {
        "el",
        "la",
        "los",
        "las",
        "de",
        "en",
        "un",
        "una",
        "que",
        "es",
        "por",
        "del",
        "con",
        "para",
        "se",
        "no",
        "su",
        "al",
        "lo",
        "como",
        "más",
        "pero",
        "sus",
        "fue",
        "son",
        "hay",
        "este",
        "todo",
    },
    "it": {
        "il",
        "la",
        "di",
        "che",
        "è",
        "un",
        "una",
        "per",
        "del",
        "della",
        "con",
        "non",
        "si",
        "in",
        "sono",
        "al",
        "da",
        "dei",
        "gli",
        "le",
        "più",
        "anche",
        "ha",
        "nel",
        "questo",
        "suo",
        "alla",
        "delle",
    },
    "pt": {
        "de",
        "que",
        "não",
        "em",
        "um",
        "uma",
        "para",
        "com",
        "por",
        "do",
        "da",
        "se",
        "os",
        "das",
        "dos",
        "mais",
        "como",
        "mas",
        "ao",
        "ou",
        "tem",
        "foi",
        "sua",
        "pelo",
        "ser",
        "são",
        "está",
        "nos",
        "seu",
    },
}

# Unicode block ranges for CJK detection
_CJK_RANGES = [
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
    (0x3400, 0x4DBF),  # CJK Extension A
]

_HIRAGANA_RANGE = (0x3040, 0x309F)
_KATAKANA_RANGE = (0x30A0, 0x30FF)


def _script_counts(text: str) -> dict[str, int]:
    """Count characters by script category."""
    counts: dict[str, int] = Counter()
    for ch in text:
        cp = ord(ch)
        if _HIRAGANA_RANGE[0] <= cp <= _HIRAGANA_RANGE[1]:
            counts["hiragana"] += 1
        elif _KATAKANA_RANGE[0] <= cp <= _KATAKANA_RANGE[1]:
            counts["katakana"] += 1
        elif 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF:
            counts["cjk"] += 1
        elif ch.isalpha():
            counts["latin"] += 1
    return counts


def _word_score(words: list[str]) -> dict[str, float]:
    """Score each language by fraction of words matching its function-word list."""
    if not words:
        return {}
    scores: dict[str, float] = {}
    total = len(words)
    for lang, wordset in _WORD_LISTS.items():
        hits = sum(1 for w in words if w in wordset)
        scores[lang] = hits / total
    return scores


def detect_language(text: str, sample_size: int = 5000) -> str | None:
    """Detect the dominant language of a text sample.

    Returns a BCP-47 code (e.g. "de-DE") or None if detection fails.
    Samples `sample_size` characters from the text for efficiency.
    """
    if not text or len(text.strip()) < 20:
        return None

    # Sample from multiple positions for better coverage
    sample = ""
    text_len = len(text)
    if text_len <= sample_size:
        sample = text
    else:
        chunk = sample_size // 3
        sample = text[:chunk] + text[text_len // 2 - chunk // 2 : text_len // 2 + chunk // 2] + text[-chunk:]

    # 1. Script-based detection for CJK
    scripts = _script_counts(sample)
    kana_count = scripts.get("hiragana", 0) + scripts.get("katakana", 0)
    cjk_count = scripts.get("cjk", 0)
    latin_count = scripts.get("latin", 0)
    total_chars = kana_count + cjk_count + latin_count

    if total_chars == 0:
        return None

    # Japanese: has hiragana/katakana (unique to Japanese)
    if kana_count > 10 or (kana_count > 0 and kana_count / max(total_chars, 1) > 0.05):
        return _LANG_CODES["ja"]

    # Chinese: CJK ideographs without kana
    if cjk_count > latin_count and cjk_count > 20:
        return _LANG_CODES["zh"]

    # 2. Word-frequency detection for Latin-script languages
    words = re.findall(r"[a-zA-ZÀ-ÖØ-öø-ÿ]+", sample.lower())
    scores = _word_score(words)

    if not scores:
        return None

    best_lang = max(scores, key=lambda k: scores[k])
    best_score = scores[best_lang]

    # Require minimum confidence (at least 3% of words are function words)
    if best_score < 0.03:
        return None

    # Disambiguation: French/Portuguese/Spanish share "de", "que", etc.
    # Check for unique markers
    if best_lang in ("fr", "pt", "es") and best_score < 0.06:
        # Too ambiguous between Romance languages
        # Look for unique diacritics/words
        if any(w in words for w in ("não", "também", "pelo", "são")):
            best_lang = "pt"
        elif any(w in words for w in ("nous", "vous", "avec", "cette", "dans")):
            best_lang = "fr"
        elif any(w in words for w in ("también", "pero", "como", "más")):
            best_lang = "es"

    return _LANG_CODES.get(best_lang)
