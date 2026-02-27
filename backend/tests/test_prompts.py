"""
Tests for build_system_prompt() — FR-2 (dynamic system prompt assembly).

Coverage:
  - All 6 layers of prompt structure
  - Level-specific config (A1 / A2)
  - Unit-specific content injection
  - Constraint text for out-of-level rejection (FR-5)
  - Fallback for unknown unit IDs (EC-2)
"""

import pytest

from app.data.prompts import build_system_prompt
from app.data.units import DOKDOKDOK_A1


# ---------------------------------------------------------------------------
# Layer 2: Level modifier
# ---------------------------------------------------------------------------

class TestLevelModifier:
    def test_a1_level_label_in_prompt(self):
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "A1" in prompt

    def test_a2_level_label_in_prompt(self):
        prompt = build_system_prompt("A2", "A1-1", None)
        assert "A2" in prompt

    def test_a2_grammar_in_modifier(self):
        """A2 modifier should mention Dativ/Perfekt/Nebensatz."""
        prompt = build_system_prompt("A2", "A1-1", None)
        assert "Dativ" in prompt or "Perfekt" in prompt

    def test_a1_example_length_constraint(self):
        """A1: max 10-word example sentences stated in prompt."""
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "10단어" in prompt

    def test_a2_example_length_constraint(self):
        """A2: max 15-word example sentences stated in prompt."""
        prompt = build_system_prompt("A2", "A1-1", None)
        assert "15단어" in prompt


# ---------------------------------------------------------------------------
# Layer 3: 56-unit summary table
# ---------------------------------------------------------------------------

class TestUnitSummaryTable:
    def test_first_unit_in_table(self):
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "A1-1" in prompt

    def test_last_unit_in_table(self):
        """Full 56-unit table must include A1-56."""
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "A1-56" in prompt

    def test_midrange_unit_in_table(self):
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "A1-28" in prompt


# ---------------------------------------------------------------------------
# Layer 4: Current unit detail
# ---------------------------------------------------------------------------

class TestUnitDetail:
    def test_unit_id_appears_in_prompt(self):
        unit_data = DOKDOKDOK_A1.get("A1-13")
        prompt = build_system_prompt("A1", "A1-13", unit_data)
        assert "A1-13" in prompt

    def test_known_unit_title_injected(self):
        """A1-12 '약속 잡기' title should appear when unit_data is passed."""
        unit_data = DOKDOKDOK_A1.get("A1-12")
        prompt = build_system_prompt("A1", "A1-12", unit_data)
        assert "약속 잡기" in prompt

    def test_unit_topics_injected(self):
        """Topics list for A1-12 should appear in prompt."""
        unit_data = DOKDOKDOK_A1.get("A1-12")
        prompt = build_system_prompt("A1", "A1-12", unit_data)
        # At least one topic from A1-12
        assert any(topic in prompt for topic in unit_data["topics"])

    def test_fallback_for_unknown_unit(self):
        """EC-2: Unknown unit_id with no unit_data → fallback note."""
        prompt = build_system_prompt("A1", "UNKNOWN-99", None)
        assert "UNKNOWN-99" in prompt
        assert "찾을 수 없습니다" in prompt

    def test_no_unit_data_does_not_crash(self):
        """Passing unit_data=None for a valid unit_id should not raise."""
        prompt = build_system_prompt("A1", "A1-5", None)
        assert isinstance(prompt, str)
        assert len(prompt) > 0


# ---------------------------------------------------------------------------
# Layer 5: Answer format
# ---------------------------------------------------------------------------

class TestAnswerFormat:
    def test_answer_format_section_present(self):
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "답변 형식" in prompt

    def test_bold_rule_present(self):
        """독일어 bold 규칙 must be stated."""
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "bold" in prompt.lower() or "bold 규칙" in prompt or "**...**" in prompt


# ---------------------------------------------------------------------------
# Layer 6: Constraints (FR-5)
# ---------------------------------------------------------------------------

class TestConstraints:
    def test_rejection_instruction_present_a1(self):
        """FR-5: A1 prompt must instruct model to reject out-of-level questions."""
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "거절" in prompt

    def test_rejection_instruction_present_a2(self):
        prompt = build_system_prompt("A2", "A1-1", None)
        # A2 mentions simplified handling ("간단히 언급")
        assert "제약" in prompt or "간단히" in prompt

    def test_encouragement_rule_present(self):
        """Tutor must not negatively evaluate learner."""
        prompt = build_system_prompt("A1", "A1-1", None)
        assert "부정적으로 평가" in prompt
