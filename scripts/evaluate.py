#!/usr/bin/env python3
"""
LinguaRAG LLM-as-Judge Evaluator (v0.3 Phase 1)

Sends fixed test questions to Claude with the production system prompt,
then uses a separate Claude call to evaluate ANSWER_FORMAT rule compliance.

Usage:
    cd /path/to/lingua-rag
    python scripts/evaluate.py
    python scripts/evaluate.py --questions scripts/test_questions.json
    python scripts/evaluate.py --output scripts/results

Requirements:
    ANTHROPIC_API_KEY must be set.
"""

import sys
import os
import json
import asyncio
import re
import argparse
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Path setup — allow importing from backend/app/
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.data.prompts import build_system_prompt  # noqa: E402
from app.data.units import DOKDOKDOK_A1           # noqa: E402
import anthropic                                   # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TUTOR_MODEL = "claude-sonnet-4-6"          # same as production
JUDGE_MODEL = "claude-sonnet-4-6"  # sonnet for accurate rule evaluation
MAX_TOKENS_TUTOR = 1024
MAX_TOKENS_JUDGE = 1024

RULES = [
    "german_bold_complete",
    "no_markdown_table",
    "translation_inline",
    "dialogue_structure",   # null = N/A (no dialogue in response)
    "example_length_ok",
    "tip_included",
]

RULE_LABELS = {
    "german_bold_complete": "독일어 bold 완결성",
    "no_markdown_table":    "표 금지",
    "translation_inline":   "번역 즉시 배치",
    "dialogue_structure":   "대화 A:/B: 구조",
    "example_length_ok":    "예문 길이 ≤10단어",
    "tip_included":         "💡 팁: 포함",
}

JUDGE_PROMPT = """\
당신은 독일어 AI 튜터 응답의 형식 준수 여부를 평가하는 심사자입니다.
아래 응답이 6가지 형식 규칙을 각각 준수하는지 평가하고, 반드시 JSON만 반환하세요.

---
질문: {question}

응답:
{response}
---

평가 규칙:

1. german_bold_complete
   응답 어디에서든(본문, 괄호, 설명문, 어휘 목록 포함) 독일어 단어·표현·문장이 `**...**`로 감싸졌는가.
   위치 예외 없음 — 괄호 안에 있어도, 문장 중간에 있어도 bold 필수.
   - PASS: 응답의 모든 독일어가 완전히 bold 처리됨
   - FAIL: bold 없이 등장하는 독일어 단어/표현 존재 (reason에 위반 텍스트 직접 인용)
   판정 기준: 독일어 단어(알파벳+독일어 문자)가 `**` 없이 나타나면 FAIL.

2. no_markdown_table
   응답에 `|` 기호 기반 markdown 표가 없는가.
   - PASS: `|` 기반 표 없음
   - FAIL: `|` 기반 표 존재

3. translation_inline
   각 독일어 줄 바로 뒤에 `→ 한국어` 번역이 따라오는가.
   - PASS: 독일어 표현 직후 `→` 번역 배치
   - FAIL: 번역을 나중에 몰아서 배치하거나 `/`로 합침

4. dialogue_structure
   대화 예문이 있을 경우 `A: **...** → ...` / `B: **...** → ...` 형식을 사용하는가.
   - PASS: A:/B: 형식 + 줄별 번역 사용 (또는 대화 없음 → null)
   - FAIL: 대화가 있는데 A:/B: 미사용 또는 줄별 번역 누락
   - null: 대화 예문이 없는 응답

5. example_length_ok
   독일어 예문이 10단어 이내인가 (A1 기준, 공백 기준 단어 수).
   - PASS: 모든 독일어 예문이 10단어 이하
   - FAIL: 10단어 초과 예문 존재

6. tip_included
   응답 마지막 부분에 `💡 팁:` 이 포함되어 있는가.
   - PASS: `💡 팁:` 줄 존재
   - FAIL: 없음

반환 형식 (JSON만, 마크다운 코드 블록 없이):
중요:
- reason 필드는 반드시 한 줄 문자열(줄바꿈 없음)로 작성하세요.
- pass 값과 reason이 반드시 일치해야 합니다. reason이 준수를 설명하면 pass: true, 위반을 설명하면 pass: false.
{{
  "rules": {{
    "german_bold_complete": {{"pass": true, "reason": "간략 이유"}},
    "no_markdown_table": {{"pass": true, "reason": "간략 이유"}},
    "translation_inline": {{"pass": false, "reason": "간략 이유"}},
    "dialogue_structure": {{"pass": null, "reason": "대화 없음"}},
    "example_length_ok": {{"pass": true, "reason": "간략 이유"}},
    "tip_included": {{"pass": true, "reason": "간략 이유"}}
  }}
}}
"""


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def load_questions(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_system_prompt(unit_id: str, level: str) -> str:
    unit_data = DOKDOKDOK_A1.get(unit_id)
    return build_system_prompt(level, unit_id, unit_data)


async def get_tutor_response(client: anthropic.AsyncAnthropic, question: dict) -> str:
    system_prompt = get_system_prompt(question["unit_id"], question["level"])
    message = await client.messages.create(
        model=TUTOR_MODEL,
        max_tokens=MAX_TOKENS_TUTOR,
        system=system_prompt,
        messages=[{"role": "user", "content": question["question"]}],
    )
    return message.content[0].text


def _parse_judge_json(raw: str) -> dict:
    """Robustly extract JSON from judge response, handling common formatting issues."""
    # Strip markdown code fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)

    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Find outermost JSON object boundaries and retry
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse judge JSON: {raw[:300]}")


async def judge_response(client: anthropic.AsyncAnthropic, question: str, response: str) -> dict:
    prompt = JUDGE_PROMPT.format(question=question, response=response)
    for attempt in range(2):
        message = await client.messages.create(
            model=JUDGE_MODEL,
            max_tokens=MAX_TOKENS_JUDGE,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        try:
            return _parse_judge_json(raw)
        except ValueError:
            if attempt == 1:
                raise


async def evaluate_question(
    client: anthropic.AsyncAnthropic, question: dict, index: int, total: int
) -> dict:
    print(f"  [{index}/{total}] {question['id']} ({question['unit_id']}) "
          f"— {question['question'][:50]}...")
    try:
        response = await get_tutor_response(client, question)
        print(f"         → 응답 수신 ({len(response)}자)")
        judgment = await judge_response(client, question["question"], response)
        return {
            "id": question["id"],
            "unit_id": question["unit_id"],
            "question": question["question"],
            "focus": question.get("focus", ""),
            "response": response,
            "judgment": judgment,
            "error": None,
        }
    except Exception as e:
        print(f"         ✗ 오류: {e}")
        return {
            "id": question["id"],
            "unit_id": question["unit_id"],
            "question": question["question"],
            "focus": question.get("focus", ""),
            "response": None,
            "judgment": None,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# Report computation
# ---------------------------------------------------------------------------

def compute_report(results: list[dict]) -> dict:
    rule_stats: dict[str, dict] = {
        r: {"pass": 0, "fail": 0, "na": 0, "error": 0} for r in RULES
    }
    total = len(results)
    errors = sum(1 for r in results if r["error"])

    for result in results:
        if result["error"] or result["judgment"] is None:
            for r in RULES:
                rule_stats[r]["error"] += 1
            continue
        rules = result["judgment"].get("rules", {})
        for rule in RULES:
            val = rules.get(rule, {}).get("pass")
            if val is True:
                rule_stats[rule]["pass"] += 1
            elif val is False:
                rule_stats[rule]["fail"] += 1
            elif val is None:
                rule_stats[rule]["na"] += 1
            else:
                rule_stats[rule]["error"] += 1

    # Pass rate: exclude N/A and errors from denominator
    rule_rates: dict[str, float | None] = {}
    for rule in RULES:
        s = rule_stats[rule]
        denom = s["pass"] + s["fail"]
        rule_rates[rule] = round(s["pass"] / denom * 100, 1) if denom > 0 else None

    applicable = [r for r in RULES if rule_rates.get(r) is not None]
    overall = (
        round(sum(rule_rates[r] for r in applicable) / len(applicable), 1)
        if applicable else None
    )

    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": TUTOR_MODEL,
        "judge_model": JUDGE_MODEL,
        "total_questions": total,
        "errors": errors,
        "overall_score": overall,
        "rule_stats": rule_stats,
        "rule_rates": rule_rates,
        "results": results,
    }


def print_report(report: dict) -> None:
    print("\n" + "=" * 62)
    print("  LinguaRAG LLM-as-Judge 평가 결과")
    print("=" * 62)
    print(f"  모델      : {report['model']}")
    print(f"  평가 심사 : {report['judge_model']}")
    print(f"  평가일시  : {report['timestamp']}")
    print(f"  총 질문   : {report['total_questions']}개  (오류: {report['errors']}개)")
    overall = report["overall_score"]
    print(f"  종합 점수 : {overall}%" if overall is not None else "  종합 점수 : N/A")
    print()
    print("  규칙별 준수율:")
    print(f"  {'규칙':<20} {'준수율':>8}   {'상세'}")
    print("  " + "-" * 55)
    for rule in RULES:
        rate = report["rule_rates"].get(rule)
        stats = report["rule_stats"][rule]
        rate_str = f"{rate:5.1f}%" if rate is not None else "  N/A "
        bar = "█" * int((rate or 0) / 10)
        na_str = f"  (N/A {stats['na']}건)" if stats["na"] > 0 else ""
        err_str = f"  (오류 {stats['error']}건)" if stats["error"] > 0 else ""
        print(f"  {RULE_LABELS[rule]:<20} {rate_str}   {bar}{na_str}{err_str}")

    # Per-question failure detail
    failures = [
        r for r in report["results"]
        if r["judgment"] and any(
            v.get("pass") is False
            for v in r["judgment"].get("rules", {}).values()
        )
    ]
    if failures:
        print()
        print("  실패 상세:")
        for r in failures:
            rules = r["judgment"]["rules"]
            failed = [RULE_LABELS[k] for k, v in rules.items() if v.get("pass") is False]
            print(f"    {r['id']} ({r['unit_id']}): {', '.join(failed)}")
            for k, v in rules.items():
                if v.get("pass") is False:
                    print(f"      - {RULE_LABELS[k]}: {v.get('reason', '')}")
    print("=" * 62)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser(description="LinguaRAG LLM-as-Judge Evaluator")
    parser.add_argument(
        "--questions",
        default=str(REPO_ROOT / "scripts" / "test_questions.json"),
        help="Path to test questions JSON",
    )
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "scripts" / "results"),
        help="Directory to save JSON report",
    )
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.")
        sys.exit(1)

    questions_path = Path(args.questions)
    if not questions_path.exists():
        print(f"Error: 질문 파일을 찾을 수 없습니다: {questions_path}")
        sys.exit(1)

    questions = load_questions(questions_path)
    print(f"LinguaRAG Evaluator — {len(questions)}개 질문 로드")
    print(f"Tutor: {TUTOR_MODEL}  /  Judge: {JUDGE_MODEL}\n")

    client = anthropic.AsyncAnthropic(api_key=api_key)

    results = []
    for i, question in enumerate(questions, 1):
        result = await evaluate_question(client, question, i, len(questions))
        results.append(result)

    report = compute_report(results)
    print_report(report)

    # Save JSON report
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H%M")
    output_path = output_dir / f"{ts}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n  결과 저장: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
