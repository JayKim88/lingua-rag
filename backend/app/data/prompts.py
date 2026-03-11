"""
System prompt builder for LinguaRAG.

Universal language tutor prompt — works with any language and any user-uploaded PDF.
No hardcoded curriculum, levels, or language-specific rules.

Prompt caching structure:
  - Fixed prefix (~500 tokens): Tutor role + answer format rules → cached
  - Dynamic suffix: RAG chunks from user's PDF → per-request
"""

from typing import Optional


# ---------------------------------------------------------------------------
# Fixed tutor role declaration (language-parametric)
# ---------------------------------------------------------------------------

def _build_tutor_role(language: str, learner_language: str = "한국어") -> str:
    return (
        f"당신은 LinguaRAG의 언어 튜터입니다. "
        f"{learner_language}를 모국어로 하는 학습자를 대상으로 "
        f"{language} 학습을 도와줍니다. "
        f"학습자가 업로드한 교재(PDF)를 기반으로 질문에 답하세요. "
        f"항상 친절하고 격려하는 톤을 유지하세요."
    )


# ---------------------------------------------------------------------------
# Fixed answer format template (language-agnostic)
# ---------------------------------------------------------------------------

ANSWER_FORMAT = """
## 답변 형식 (반드시 준수)

다음 구조로 답변하세요:

[개념 설명] — 학습자의 모국어로 2~3문장

예문 (문답 형태):
A: **학습 대상 언어 질문** → 모국어 번역
B: **학습 대상 언어 대답** → 모국어 번역

어휘 목록 (문답이 어울리지 않는 경우):
**학습 대상 언어 표현** → 모국어 뜻

💡 팁: 핵심 학습 포인트 1가지

**[bold 규칙]** 학습 대상 언어의 단어·표현·문장은 `**...**`로 감싸세요.
**[표 금지]** 어휘·예문 목록에 markdown 표(`|` 기호)를 사용하지 마세요.
**[번역 배치]** 각 예문 바로 뒤에 → 번역을 붙이세요. 번역을 몰아넣지 마세요.
"""


# ---------------------------------------------------------------------------
# Main builder (returns two parts for prompt caching)
# ---------------------------------------------------------------------------

def build_system_prompt_parts(
    language: str,
    learner_language: str = "한국어",
    rag_chunks: Optional[list[str]] = None,
) -> tuple[str, str]:
    """
    Build the system prompt split into a cacheable prefix and a dynamic suffix.

    Cacheable prefix:
      Tutor role + answer format rules. Identical across requests for the
      same language → high cache hit rate.

    Dynamic suffix:
      RAG chunks from the user's PDF. Changes per request; never cached.

    Args:
        language: Target language being learned (e.g. "독일어", "영어", "일본어").
        learner_language: Learner's native language. Defaults to "한국어".
        rag_chunks: Retrieved textbook chunks for RAG context injection.

    Returns:
        (fixed_prefix, dynamic_suffix)
    """
    # --- Cacheable prefix ---
    fixed_prefix = "\n".join([
        _build_tutor_role(language, learner_language),
        ANSWER_FORMAT,
        "## 제약 조건\n",
        "- 교재 컨텍스트가 제공되면 교재 내용을 기반으로 답변하세요.",
        "- 교재 컨텍스트가 없으면 일반 지식으로 답변하되, 교재에 없는 내용임을 명시하세요.",
        "- 학습자를 절대 지적하거나 부정적으로 평가하지 마세요.",
    ])

    # --- Dynamic suffix ---
    dynamic_parts: list[str] = []

    if rag_chunks:
        joined = "\n\n---\n\n".join(rag_chunks)
        dynamic_parts.append(f"## 교재 원문 참고\n\n{joined}")

    dynamic_suffix = "\n\n".join(dynamic_parts) if dynamic_parts else ""

    return fixed_prefix, dynamic_suffix


def build_system_prompt(
    language: str,
    learner_language: str = "한국어",
    rag_chunks: Optional[list[str]] = None,
) -> str:
    """Convenience wrapper that returns the full prompt as a single string."""
    fixed, dynamic = build_system_prompt_parts(language, learner_language, rag_chunks)
    if dynamic:
        return f"{fixed}\n\n{dynamic}"
    return fixed
