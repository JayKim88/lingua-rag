"""
Tests for build_system_prompt() — universal language tutor prompt.

Coverage:
  - Tutor role with language parameter
  - Answer format rules
  - RAG chunk injection
  - Constraint text
  - Prompt caching split (fixed prefix + dynamic suffix)
"""

from app.data.prompts import build_system_prompt, build_system_prompt_parts

# ---------------------------------------------------------------------------
# Tutor role
# ---------------------------------------------------------------------------


class TestTutorRole:
    def test_language_in_prompt(self):
        prompt = build_system_prompt("독일어")
        assert "독일어" in prompt

    def test_custom_language(self):
        prompt = build_system_prompt("일본어")
        assert "일본어" in prompt

    def test_learner_language_default(self):
        prompt = build_system_prompt("영어")
        assert "한국어" in prompt

    def test_custom_learner_language(self):
        prompt = build_system_prompt("독일어", learner_language="영어")
        assert "영어" in prompt


# ---------------------------------------------------------------------------
# Answer format
# ---------------------------------------------------------------------------


class TestAnswerFormat:
    def test_answer_format_section_present(self):
        prompt = build_system_prompt("독일어")
        assert "답변 형식" in prompt

    def test_bold_rule_present(self):
        prompt = build_system_prompt("독일어")
        assert "bold" in prompt.lower() or "**...**" in prompt

    def test_table_prohibition(self):
        prompt = build_system_prompt("독일어")
        assert "표 금지" in prompt


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------


class TestConstraints:
    def test_encouragement_rule_present(self):
        """Tutor must not negatively evaluate learner."""
        prompt = build_system_prompt("독일어")
        assert "부정적으로 평가" in prompt

    def test_textbook_context_instruction(self):
        prompt = build_system_prompt("독일어")
        assert "교재 컨텍스트" in prompt


# ---------------------------------------------------------------------------
# RAG chunk injection
# ---------------------------------------------------------------------------


class TestRagInjection:
    def test_rag_chunks_appear_in_prompt(self):
        chunks = ["Guten Tag은 '좋은 날'이라는 뜻입니다.", "Wie geht es Ihnen?"]
        prompt = build_system_prompt("독일어", rag_chunks=chunks)
        assert "Guten Tag" in prompt
        assert "Wie geht es Ihnen?" in prompt

    def test_rag_section_header(self):
        chunks = ["test chunk"]
        prompt = build_system_prompt("독일어", rag_chunks=chunks)
        assert "교재 원문 참고" in prompt

    def test_no_rag_section_without_chunks(self):
        prompt = build_system_prompt("독일어")
        assert "교재 원문 참고" not in prompt


# ---------------------------------------------------------------------------
# Prompt caching split
# ---------------------------------------------------------------------------


class TestPromptCaching:
    def test_returns_two_parts(self):
        fixed, dynamic = build_system_prompt_parts("독일어")
        assert isinstance(fixed, str)
        assert isinstance(dynamic, str)

    def test_fixed_prefix_contains_role(self):
        fixed, _ = build_system_prompt_parts("독일어")
        assert "튜터" in fixed

    def test_dynamic_suffix_contains_rag(self):
        chunks = ["chunk content"]
        _, dynamic = build_system_prompt_parts("독일어", rag_chunks=chunks)
        assert "chunk content" in dynamic

    def test_dynamic_empty_without_rag(self):
        _, dynamic = build_system_prompt_parts("독일어")
        assert dynamic == ""
