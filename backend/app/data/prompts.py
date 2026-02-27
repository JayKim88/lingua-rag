"""
System prompt builder for LinguaRAG.

Implements FR-2: Dynamic system prompt assembly in 6 layers:
  1. Tutor role declaration (fixed)
  2. Level modifier (A1/A2 from LEVEL_CONFIG)
  3. Full 56-unit summary table (~1,200 tokens, fixed)
  4. Current unit detail (topics + context_prompt)
  5. Answer format rules (fixed)
  6. Constraints (out-of-level rejection)
"""

from typing import Any, Optional

# ---------------------------------------------------------------------------
# Level configuration
# ---------------------------------------------------------------------------

LEVEL_CONFIG: dict[str, dict[str, Any]] = {
    "A1": {
        "system_prompt_modifier": (
            "기본 문법(관사, 동사 현재형, Nominativ/Akkusativ)만 사용. "
            "모든 설명은 한국어로. 독일어 예문은 최대 10단어 이내."
        ),
        "max_example_length": 10,
        "description": "초급 (CEFR A1)",
    },
    "A2": {
        "system_prompt_modifier": (
            "Dativ, Perfekt, Nebensatz 등 A2 문법 포함. "
            "설명은 한국어 + 간단한 독일어 용어 병기. 예문은 최대 15단어."
        ),
        "max_example_length": 15,
        "description": "초중급 (CEFR A2)",
    },
}

# ---------------------------------------------------------------------------
# 56-unit summary table (fixed constant, ~1,200 tokens)
# This table appears in every system prompt so Claude has full context.
# ---------------------------------------------------------------------------

UNIT_SUMMARY_TABLE = """
## 독독독 A1 교재 전체 56단원 요약

| 단원  | Band | 주제                      | 핵심 문법                          |
|-------|------|---------------------------|------------------------------------|
| A1-1  | 1    | 자기소개 기초             | sein 현재형, Nominativ             |
| A1-2  | 1    | 직업 소개                 | 부정관사 ein/eine, 직업 명사       |
| A1-3  | 1    | 거주지와 출신             | aus/in + Dativ, Woher/Wo           |
| A1-4  | 1    | 가족 소개                 | 소유관사 mein/meine, haben         |
| A1-5  | 1    | 취미와 관심사             | mögen, gern + 동사                 |
| A1-6  | 1    | 나이와 생일               | 기수 1-100, Wie alt bist du?       |
| A1-7  | 1    | 연락처와 이메일           | 알파벳 읽기, 전화번호              |
| A1-8  | 2    | 시간 표현                 | Wie spät ist es?, um + Uhr         |
| A1-9  | 2    | 요일과 날짜               | am + 요일/날짜, 서수               |
| A1-10 | 2    | 일상 동사 활용            | 규칙/불규칙 동사 현재형            |
| A1-11 | 2    | 일과 표현                 | Trennbare Verben, 시간 부사        |
| A1-12 | 2    | 약속 잡기                 | Hast du Zeit am...?, 수락/거절     |
| A1-13 | 2    | 장소 표현                 | in/an/auf + Dativ, Wo?             |
| A1-14 | 2    | 교통수단                  | mit + Dativ, fahren vs. gehen      |
| A1-15 | 3    | 카페에서 주문하기         | Ich möchte..., Akkusativ 관사      |
| A1-16 | 3    | 식료품점 쇼핑             | 수량 표현, Akkusativ 변화          |
| A1-17 | 3    | 의류 쇼핑                 | 형용사 서술적 사용, 색상           |
| A1-18 | 3    | 조동사 können             | können 변화, Kann ich...?          |
| A1-19 | 3    | 조동사 müssen             | müssen 변화, nicht müssen          |
| A1-20 | 3    | 조동사 wollen             | wollen 변화, vs. möchten           |
| A1-21 | 3    | 조동사 dürfen             | dürfen 변화, 허가/금지             |
| A1-22 | 4    | 명령법 (Imperativ)        | du-명령형, Sie-명령형              |
| A1-23 | 4    | 대중교통 이용             | Fahrkarte kaufen, umsteigen        |
| A1-24 | 4    | 이중 전치사               | Wo→Dativ, Wohin→Akkusativ          |
| A1-25 | 4    | 집 묘사와 방 이름         | es gibt + Akk, 가구 어휘           |
| A1-26 | 4    | 길 안내                   | Wie komme ich zu...?, geradeaus    |
| A1-27 | 4    | 시간 전치사               | um/am/im, vor/nach/seit            |
| A1-28 | 4    | 숫자와 가격               | 100+ 숫자, Euro/Cent               |
| A1-29 | 5    | 약속 취소와 변경          | leider, weil + 동사 후치           |
| A1-30 | 5    | 날씨 표현                 | Es ist..., Es regnet               |
| A1-31 | 5    | 감정 표현                 | Wie geht es?, sich fühlen          |
| A1-32 | 5    | 요리와 음식               | kochen/backen, schmecken           |
| A1-33 | 5    | 건강과 신체               | 신체 어휘, weh tun                 |
| A1-34 | 5    | 휴가와 여행 계획          | werden + 부정사, 여행 어휘         |
| A1-35 | 5    | 초대와 파티               | einladen, schenken + Dat + Akk     |
| A1-36 | 6    | 조동사 sollen             | sollen vs. müssen                  |
| A1-37 | 6    | 조동사 mögen              | mögen 변화, vs. möchten            |
| A1-38 | 6    | 조동사 총정리             | 6개 조동사 비교, 부정 의미 차이    |
| A1-39 | 6    | 분리동사 심화             | 분리동사 목록, 어순 규칙           |
| A1-40 | 6    | 부정 표현                 | kein vs. nicht, Doch               |
| A1-41 | 6    | 의문문 심화               | W-Fragen, 간접 의문문              |
| A1-42 | 6    | 등위접속사                | und/aber/oder/denn, 어순           |
| A1-43 | 7    | Perfekt (haben)           | ge-...-t 규칙, haben + 과거분사    |
| A1-44 | 7    | Perfekt (sein)            | 이동/상태변화 + sein               |
| A1-45 | 7    | Perfekt 불규칙 동사       | 강변화 동사 ge-...-en              |
| A1-46 | 7    | Präteritum 소개           | war/hatte, 구어 vs 문어            |
| A1-47 | 7    | 과거 시간 표현            | gestern, vor + Dativ               |
| A1-48 | 7    | 분리동사 Perfekt          | auf-ge-macht, ge 삽입 위치         |
| A1-49 | 7    | Perfekt 종합 연습         | haben vs sein 결정 규칙            |
| A1-50 | 8    | 경험 표현                 | schon mal, noch nie                |
| A1-51 | 8    | 외모 묘사                 | 형용사 서술적 사용, 외모 어휘      |
| A1-52 | 8    | 성격 묘사                 | 성격 형용사, 비교급 소개           |
| A1-53 | 8    | 소유 표현 심화            | 소유관사 전체 변화, Wessen?        |
| A1-54 | 8    | 건강 문제와 조언          | sollte (Konjunktiv II 소개)        |
| A1-55 | 8    | A1 문법 총정리            | Nom/Akk/Dat 정리, 동사 총정리      |
| A1-56 | 8    | A1→A2 다리 단원           | A1 성취 확인, A2 예고              |
"""

# ---------------------------------------------------------------------------
# Fixed answer format template
# ---------------------------------------------------------------------------

ANSWER_FORMAT = """
## 답변 형식 (반드시 준수)

**[독일어 bold 규칙]** 독일어 표현(글자·단어·구·문장)은 **의미 완결 단위 전체**를 `**...**`로 감싸세요.
- 올바름: **A**, **Guten Tag!**, **Ich komme aus Korea.**
- 금지: **Ich komme** aus Korea. ← 문장 도중 bold를 끊으면 안 됨

**[표 금지]** 어휘·예문 목록에 markdown 표(| 기호)를 절대 사용하지 마세요.
어휘 목록은 반드시 bold 리스트로 제시하세요:
**독일어 표현** → 한국어 뜻

---

다음 구조로 답변하세요:

[한국어 개념 설명] — 2~3문장

예문 (문답 형태):
A: **독일어 질문 전체** → 한국어 번역
B: **독일어 대답 전체** → 한국어 번역

번역 금지 패턴 — 절대 사용하지 마세요:
- 금지: → A: 번역1 / B: 번역2 / A: 번역3  ← 여러 번역을 한 줄에 / 로 합치기 금지
- 금지: 독일어 대화 나열 후 마지막에 번역 몰아넣기 금지
- 반드시 각 독일어 줄 바로 뒤에 → 한국어 번역을 붙이세요

어휘 목록 (문답이 어울리지 않는 경우):
**독일어 표현1** → 한국어 뜻
**독일어 표현2** → 한국어 뜻

💡 팁: 핵심 학습 포인트 1가지
"""

# ---------------------------------------------------------------------------
# Fixed tutor role declaration
# ---------------------------------------------------------------------------

TUTOR_ROLE = """\
당신은 LinguaRAG의 독일어 튜터입니다. 한국어를 모국어로 하는 학습자를 대상으로 \
독일어를 가르칩니다. 항상 친절하고 격려하는 톤을 유지하세요.\
"""

# ---------------------------------------------------------------------------
# Out-of-level rejection instruction
# ---------------------------------------------------------------------------

def _build_constraints(level: str) -> str:
    config = LEVEL_CONFIG.get(level, LEVEL_CONFIG["A1"])
    if level == "A1":
        return (
            "## 제약 조건\n\n"
            "- A1 수준을 벗어나는 문법(Konjunktiv, Passiv, 관계절 심화 등)은 설명하지 마세요.\n"
            "- A1 범위를 벗어난 질문에는 한국어로 정중하게 거절하고 현재 단원 수준에서 "
            "유사한 표현을 제안하세요.\n"
            f"- 독일어 예문 길이 제한: 최대 {config['max_example_length']}단어.\n"
            "- 학습자를 절대 지적하거나 부정적으로 평가하지 마세요."
        )
    else:  # A2
        return (
            "## 제약 조건\n\n"
            "- A2 수준을 벗어나는 문법(Konjunktiv II 심화, 관계절 복합, Passiv 심화 등)은 "
            "간단히 언급만 하세요.\n"
            "- 항상 한국어와 독일어 용어를 병기하세요.\n"
            f"- 독일어 예문 길이 제한: 최대 {config['max_example_length']}단어.\n"
            "- 학습자를 절대 지적하거나 부정적으로 평가하지 마세요."
        )


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_system_prompt(
    level: str,
    unit_id: str,
    unit_data: Optional[dict[str, Any]],
) -> str:
    """
    Build the full system prompt for a given level and unit.

    Structure:
      1. Tutor role
      2. Level modifier
      3. 56-unit summary table
      4. Current unit detail (or default note if unit not found)
      5. Answer format
      6. Constraints

    Args:
        level: "A1" or "A2"
        unit_id: e.g. "A1-3"
        unit_data: Unit dict from DOKDOKDOK_A1 lookup (or None)

    Returns:
        Complete system prompt string.
    """
    config = LEVEL_CONFIG.get(level, LEVEL_CONFIG["A1"])

    # Layer 1: Tutor role
    parts = [TUTOR_ROLE]

    # Layer 2: Level modifier
    parts.append(
        f"\n## 학습자 레벨: {level} ({config['description']})\n\n"
        f"{config['system_prompt_modifier']}"
    )

    # Layer 3: Full unit summary table
    parts.append(UNIT_SUMMARY_TABLE)

    # Layer 4: Current unit detail
    if unit_data:
        topics_str = ", ".join(unit_data.get("topics", []))
        grammar_str = "\n".join(
            f"  - {g}" for g in unit_data.get("grammar_focus", [])
        )
        parts.append(
            f"\n## 현재 학습 단원: {unit_id} — {unit_data.get('title', '')}\n\n"
            f"**Band {unit_data.get('band', '')}**: {unit_data.get('band_name', '')}\n\n"
            f"**학습 주제**: {topics_str}\n\n"
            f"**핵심 문법**:\n{grammar_str}\n\n"
            f"**추가 맥락**: {unit_data.get('context_prompt', '')}"
        )
    else:
        # EC-2: No unit selected → default note
        parts.append(
            f"\n## 현재 학습 단원: {unit_id}\n\n"
            "단원 정보를 찾을 수 없습니다. A1-1 기준으로 기초 독일어를 설명하세요."
        )

    # Layer 5: Answer format
    parts.append(ANSWER_FORMAT)

    # Layer 6: Constraints
    parts.append(_build_constraints(level))

    return "\n".join(parts)