#!/usr/bin/env python3
"""
LinguaRAG LLM-as-Judge Evaluator — Universal Skeleton (Phase 4 placeholder).

Sends test questions to Claude with the production system prompt,
then uses a separate Claude call to evaluate answer quality rules.

Phase 4 TODO:
  - Design universal evaluation rules (answer_grounded_in_pdf, correct_language, etc.)
  - Create test question sets per language
  - Add Context Precision / Context Recall metrics

Usage:
    cd /path/to/lingua-rag
    python scripts/evaluate.py --questions scripts/test_questions.json

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
import anthropic                                   # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TUTOR_MODEL = "claude-sonnet-4-6"
JUDGE_MODEL = "claude-sonnet-4-6"
MAX_TOKENS_TUTOR = 1024
MAX_TOKENS_JUDGE = 1024

# Universal rules — language-agnostic quality criteria
RULES = [
    "answer_grounded_in_context",
    "correct_target_language",
    "answer_completeness",
    "no_hallucination",
    "clear_explanation",
]

RULE_LABELS = {
    "answer_grounded_in_context": "컨텍스트 기반 답변",
    "correct_target_language":    "올바른 학습 언어 사용",
    "answer_completeness":        "답변 완결성",
    "no_hallucination":           "허위 정보 없음",
    "clear_explanation":          "명확한 설명",
}

JUDGE_PROMPT = """\
You are a judge evaluating an AI language tutor's response quality.
Evaluate whether the response follows these 5 universal rules, and return JSON only.

---
Question: {question}

Response:
{response}

Context (RAG chunks provided to tutor, if any):
{context}
---

Evaluation rules:

1. answer_grounded_in_context
   Is the answer grounded in the provided context (RAG chunks)?
   - PASS: answer uses information from the context
   - FAIL: answer fabricates information not in context
   - null: no context was provided (free conversation)

2. correct_target_language
   Does the response use the correct target language for examples?
   - PASS: examples are in the expected language
   - FAIL: wrong language used or mixed incorrectly

3. answer_completeness
   Does the response fully address the user's question?
   - PASS: all parts of the question answered
   - FAIL: parts of the question ignored or skipped

4. no_hallucination
   Is the response free from fabricated facts (grammar rules, vocabulary, etc.)?
   - PASS: all facts are accurate
   - FAIL: contains incorrect information

5. clear_explanation
   Is the explanation clear and well-structured for a language learner?
   - PASS: well-organized, easy to follow
   - FAIL: confusing, disorganized, or overly complex

Return format (JSON only, no markdown code blocks):
{{
  "rules": {{
    "answer_grounded_in_context": {{"pass": true, "reason": "brief reason"}},
    "correct_target_language": {{"pass": true, "reason": "brief reason"}},
    "answer_completeness": {{"pass": false, "reason": "brief reason"}},
    "no_hallucination": {{"pass": true, "reason": "brief reason"}},
    "clear_explanation": {{"pass": true, "reason": "brief reason"}}
  }}
}}
"""


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def load_questions(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_system_prompt(language: str) -> str:
    return build_system_prompt(language)


async def get_tutor_response(client: anthropic.AsyncAnthropic, question: dict) -> str:
    language = question.get("language", "German")
    system_prompt = get_system_prompt(language)
    message = await client.messages.create(
        model=TUTOR_MODEL,
        max_tokens=MAX_TOKENS_TUTOR,
        system=system_prompt,
        messages=[{"role": "user", "content": question["question"]}],
    )
    return message.content[0].text


def _parse_judge_json(raw: str) -> dict:
    """Robustly extract JSON from judge response."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse judge JSON: {raw[:300]}")


async def judge_response(client: anthropic.AsyncAnthropic, question: str, response: str, context: str = "N/A") -> dict:
    prompt = JUDGE_PROMPT.format(question=question, response=response, context=context)
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
    q_id = question.get("id", f"q{index:02d}")
    print(f"  [{index}/{total}] {q_id} — {question['question'][:50]}...")
    try:
        response = await get_tutor_response(client, question)
        print(f"         → 응답 수신 ({len(response)}자)")
        judgment = await judge_response(client, question["question"], response)
        return {
            "id": q_id,
            "question": question["question"],
            "language": question.get("language", "German"),
            "focus": question.get("focus", ""),
            "response": response,
            "judgment": judgment,
            "error": None,
        }
    except Exception as e:
        print(f"         ✗ 오류: {e}")
        return {
            "id": q_id,
            "question": question["question"],
            "language": question.get("language", "German"),
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
            print(f"    {r['id']}: {', '.join(failed)}")
            for k, v in rules.items():
                if v.get("pass") is False:
                    print(f"      - {RULE_LABELS[k]}: {v.get('reason', '')}")
    print("=" * 62)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser(description="LinguaRAG LLM-as-Judge Evaluator (Universal)")
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

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H%M")
    output_path = output_dir / f"{ts}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n  결과 저장: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
