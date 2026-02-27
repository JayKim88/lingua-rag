"""
Tests for _build_messages() — message array construction for Claude API.

FR-4: History is injected as alternating user/assistant messages.
The repository already limits to 10 messages; _build_messages trusts that.
"""

from app.services.claude_service import _build_messages


class TestBuildMessages:
    def test_empty_history_returns_single_user_message(self):
        result = _build_messages([], "안녕하세요")
        assert result == [{"role": "user", "content": "안녕하세요"}]

    def test_new_message_always_appended_last(self):
        history = [
            {"role": "user", "content": "Q1"},
            {"role": "assistant", "content": "A1"},
        ]
        result = _build_messages(history, "Q2")
        assert result[-1] == {"role": "user", "content": "Q2"}

    def test_history_order_preserved(self):
        history = [
            {"role": "user", "content": "첫 번째 질문"},
            {"role": "assistant", "content": "첫 번째 답변"},
        ]
        result = _build_messages(history, "두 번째 질문")
        assert result[0]["content"] == "첫 번째 질문"
        assert result[1]["content"] == "첫 번째 답변"
        assert result[2]["content"] == "두 번째 질문"

    def test_only_role_and_content_extracted(self):
        """Extra DB fields (id, token_count, created_at) must be stripped."""
        history = [
            {
                "role": "user",
                "content": "Q",
                "id": "uuid-abc",
                "token_count": 5,
                "created_at": "2026-02-27T10:00:00",
            }
        ]
        result = _build_messages(history, "follow up")
        assert result[0] == {"role": "user", "content": "Q"}

    def test_result_length_equals_history_plus_one(self):
        history = [
            {"role": "user", "content": "Q1"},
            {"role": "assistant", "content": "A1"},
            {"role": "user", "content": "Q2"},
            {"role": "assistant", "content": "A2"},
        ]
        result = _build_messages(history, "Q3")
        assert len(result) == len(history) + 1

    def test_all_messages_have_role_and_content(self):
        history = [{"role": "user", "content": "test"}]
        result = _build_messages(history, "follow")
        for msg in result:
            assert "role" in msg
            assert "content" in msg
