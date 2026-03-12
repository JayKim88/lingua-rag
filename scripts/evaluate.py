#!/usr/bin/env python3
"""
LinguaRAG LLM-as-Judge Evaluator (Universal)

Evaluates AI language tutor quality across any target language.
Supports both free-conversation and RAG-grounded questions.

Two evaluation dimensions:
  1. Content quality (5 rules) — LLM-as-Judge
  2. Format compliance (3 rules) — LLM-as-Judge
  3. RAG metrics — Context Precision/Recall via ground truth keywords

Usage:
    cd /path/to/lingua-rag
    python scripts/evaluate.py
    python scripts/evaluate.py --questions scripts/test_questions.json
    python scripts/evaluate.py --concurrency 3

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

# ---------------------------------------------------------------------------
# Rules — content quality + format compliance
# ---------------------------------------------------------------------------
CONTENT_RULES = [
    "answer_grounded_in_context",
    "correct_target_language",
    "answer_completeness",
    "no_hallucination",
    "clear_explanation",
]

FORMAT_RULES = [
    "format_bold",
    "format_no_table",
    "translation_inline",
]

ALL_RULES = CONTENT_RULES + FORMAT_RULES

RULE_LABELS = {
    # Content
    "answer_grounded_in_context": "컨텍스트 기반 답변",
    "correct_target_language":    "올바른 학습 언어 사용",
    "answer_completeness":        "답변 완결성",
    "no_hallucination":           "허위 정보 없음",
    "clear_explanation":          "명확한 설명",
    # Format
    "format_bold":                "학습 언어 bold 처리",
    "format_no_table":            "표 금지 준수",
    "translation_inline":         "번역 즉시 배치",
}

JUDGE_PROMPT = """\
당신은 AI 언어 튜터 응답의 품질과 형식을 평가하는 심사자입니다.
아래 응답이 8가지 규칙을 각각 준수하는지 평가하고, 반드시 JSON만 반환하세요.

---
학습 대상 언어: {language}
질문: {question}

교재 컨텍스트 (RAG):
{context}

응답:
{response}
---

## 콘텐츠 품질 규칙

1. answer_grounded_in_context
   교재 컨텍스트가 제공되었을 때, 답변이 해당 컨텍스트에 기반하는가?
   - PASS: 컨텍스트 내용을 활용한 답변
   - FAIL: 컨텍스트를 무시하고 자체 지식만 사용
   - null: 컨텍스트 미제공 (자유 대화)

2. correct_target_language
   예시/예문이 올바른 학습 대상 언어({language})로 작성되었는가?
   - PASS: 모든 예시가 올바른 언어
   - FAIL: 잘못된 언어 사용 또는 언어 혼동

3. answer_completeness
   질문의 모든 부분에 답변했는가?
   - PASS: 질문에 완전히 답변
   - FAIL: 일부 누락

4. no_hallucination
   문법 규칙, 어휘 의미 등 사실 관계가 정확한가?
   - PASS: 모든 정보 정확
   - FAIL: 부정확한 정보 포함 (reason에 구체적 오류 기재)

5. clear_explanation
   학습자가 이해하기 쉽게 구조화되어 있는가?
   - PASS: 명확하고 체계적
   - FAIL: 혼란스럽거나 비체계적

## 형식 규칙

6. format_bold
   학습 대상 언어({language})의 단어·표현·문장이 **bold**로 감싸졌는가?
   - PASS: 학습 언어 텍스트가 bold 처리됨
   - FAIL: bold 없이 등장하는 학습 언어 표현 존재

7. format_no_table
   응답에 `|` 기호 기반 markdown 표가 없는가?
   - PASS: 표 없음
   - FAIL: `|` 기반 표 존재

8. translation_inline
   학습 언어 예문 바로 뒤에 `→ 번역`이 따라오는가? (번역을 몰아넣지 않았는가)
   - PASS: 각 예문 직후 번역 배치
   - FAIL: 번역 몰아넣기 또는 번역 누락

반환 형식 (JSON만, 마크다운 코드 블록 없이):
중요: reason은 반드시 한 줄 문자열(줄바꿈 없음)로 작성하세요.
{{
  "rules": {{
    "answer_grounded_in_context": {{"pass": true, "reason": "간략 이유"}},
    "correct_target_language": {{"pass": true, "reason": "간략 이유"}},
    "answer_completeness": {{"pass": true, "reason": "간략 이유"}},
    "no_hallucination": {{"pass": true, "reason": "간략 이유"}},
    "clear_explanation": {{"pass": true, "reason": "간략 이유"}},
    "format_bold": {{"pass": true, "reason": "간략 이유"}},
    "format_no_table": {{"pass": true, "reason": "간략 이유"}},
    "translation_inline": {{"pass": false, "reason": "간략 이유"}}
  }}
}}
"""


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def load_questions(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def get_tutor_response(
    client: anthropic.AsyncAnthropic,
    question: dict,
) -> str:
    """Get a response from the tutor using the production system prompt."""
    language = question.get("language", "독일어")
    rag_chunks = question.get("context")  # list[str] | None

    system_prompt = build_system_prompt(
        language=language,
        rag_chunks=rag_chunks,
    )

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


async def judge_response(
    client: anthropic.AsyncAnthropic,
    question: str,
    response: str,
    language: str,
    context: str = "(컨텍스트 없음 — 자유 대화)",
) -> dict:
    """Use a separate Claude call to judge the tutor's response."""
    prompt = JUDGE_PROMPT.format(
        question=question,
        response=response,
        language=language,
        context=context,
    )
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


# ---------------------------------------------------------------------------
# RAG metrics — keyword-based ground truth
# ---------------------------------------------------------------------------

def compute_rag_metrics(response: str, expected_keywords: list[str] | None) -> dict | None:
    """
    Compute simple RAG recall metric based on expected keywords.

    Context Recall: what fraction of expected keywords appear in the response?
    Returns None if no expected_in_response is defined.
    """
    if not expected_keywords:
        return None

    response_lower = response.lower()
    found = [kw for kw in expected_keywords if kw.lower() in response_lower]

    return {
        "expected": expected_keywords,
        "found": found,
        "recall": round(len(found) / len(expected_keywords), 3) if expected_keywords else 0,
    }


# ---------------------------------------------------------------------------
# Evaluate a single question
# ---------------------------------------------------------------------------

async def evaluate_question(
    client: anthropic.AsyncAnthropic,
    question: dict,
    index: int,
    total: int,
) -> dict:
    q_id = question.get("id", f"q{index:02d}")
    language = question.get("language", "독일어")
    context_chunks = question.get("context")
    print(f"  [{index}/{total}] {q_id} ({language}) — {question['question'][:50]}...")

    try:
        response = await get_tutor_response(client, question)
        print(f"         → 응답 수신 ({len(response)}자)")

        # Format context for judge
        context_str = (
            "\n---\n".join(context_chunks)
            if context_chunks
            else "(컨텍스트 없음 — 자유 대화)"
        )

        judgment = await judge_response(
            client,
            question["question"],
            response,
            language=language,
            context=context_str,
        )

        # RAG keyword recall
        rag_metrics = compute_rag_metrics(
            response, question.get("expected_in_response")
        )

        return {
            "id": q_id,
            "question": question["question"],
            "language": language,
            "focus": question.get("focus", ""),
            "has_context": context_chunks is not None,
            "response": response,
            "judgment": judgment,
            "rag_metrics": rag_metrics,
            "error": None,
        }
    except Exception as e:
        print(f"         ✗ 오류: {e}")
        return {
            "id": q_id,
            "question": question["question"],
            "language": language,
            "focus": question.get("focus", ""),
            "has_context": question.get("context") is not None,
            "response": None,
            "judgment": None,
            "rag_metrics": None,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# Report computation
# ---------------------------------------------------------------------------

def compute_report(results: list[dict]) -> dict:
    rule_stats: dict[str, dict] = {
        r: {"pass": 0, "fail": 0, "na": 0, "error": 0} for r in ALL_RULES
    }
    total = len(results)
    errors = sum(1 for r in results if r["error"])

    for result in results:
        if result["error"] or result["judgment"] is None:
            for r in ALL_RULES:
                rule_stats[r]["error"] += 1
            continue
        rules = result["judgment"].get("rules", {})
        for rule in ALL_RULES:
            val = rules.get(rule, {}).get("pass")
            if val is True:
                rule_stats[rule]["pass"] += 1
            elif val is False:
                rule_stats[rule]["fail"] += 1
            elif val is None:
                rule_stats[rule]["na"] += 1
            else:
                rule_stats[rule]["error"] += 1

    # Pass rate per rule (exclude N/A and errors from denominator)
    rule_rates: dict[str, float | None] = {}
    for rule in ALL_RULES:
        s = rule_stats[rule]
        denom = s["pass"] + s["fail"]
        rule_rates[rule] = round(s["pass"] / denom * 100, 1) if denom > 0 else None

    applicable = [r for r in ALL_RULES if rule_rates.get(r) is not None]
    overall = (
        round(sum(rule_rates[r] for r in applicable) / len(applicable), 1)
        if applicable else None
    )

    # RAG recall aggregate
    rag_recalls = [
        r["rag_metrics"]["recall"]
        for r in results
        if r["rag_metrics"] is not None
    ]
    avg_rag_recall = (
        round(sum(rag_recalls) / len(rag_recalls) * 100, 1)
        if rag_recalls else None
    )

    # Content vs Format breakdown
    content_applicable = [r for r in CONTENT_RULES if rule_rates.get(r) is not None]
    content_score = (
        round(sum(rule_rates[r] for r in content_applicable) / len(content_applicable), 1)
        if content_applicable else None
    )
    format_applicable = [r for r in FORMAT_RULES if rule_rates.get(r) is not None]
    format_score = (
        round(sum(rule_rates[r] for r in format_applicable) / len(format_applicable), 1)
        if format_applicable else None
    )

    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": TUTOR_MODEL,
        "judge_model": JUDGE_MODEL,
        "total_questions": total,
        "errors": errors,
        "overall_score": overall,
        "content_score": content_score,
        "format_score": format_score,
        "avg_rag_recall": avg_rag_recall,
        "rule_stats": rule_stats,
        "rule_rates": rule_rates,
        "results": results,
    }


def print_report(report: dict) -> None:
    print("\n" + "=" * 66)
    print("  LinguaRAG 범용 Eval 결과")
    print("=" * 66)
    print(f"  모델      : {report['model']}")
    print(f"  평가 심사 : {report['judge_model']}")
    print(f"  평가일시  : {report['timestamp']}")
    print(f"  총 질문   : {report['total_questions']}개  (오류: {report['errors']}개)")
    print()

    # Scores summary
    overall = report["overall_score"]
    content = report["content_score"]
    fmt = report["format_score"]
    rag = report["avg_rag_recall"]
    print(f"  종합 점수  : {overall}%" if overall is not None else "  종합 점수  : N/A")
    print(f"  콘텐츠 품질: {content}%" if content is not None else "  콘텐츠 품질: N/A")
    print(f"  형식 준수  : {fmt}%" if fmt is not None else "  형식 준수  : N/A")
    print(f"  RAG Recall : {rag}%" if rag is not None else "  RAG Recall : N/A")
    print()

    # Content rules
    print("  콘텐츠 품질 규칙:")
    print(f"  {'규칙':<22} {'준수율':>8}   {'상세'}")
    print("  " + "-" * 58)
    for rule in CONTENT_RULES:
        _print_rule_row(rule, report)

    print()

    # Format rules
    print("  형식 규칙:")
    print(f"  {'규칙':<22} {'준수율':>8}   {'상세'}")
    print("  " + "-" * 58)
    for rule in FORMAT_RULES:
        _print_rule_row(rule, report)

    # RAG recall per question
    rag_results = [r for r in report["results"] if r.get("rag_metrics")]
    if rag_results:
        print()
        print("  RAG Keyword Recall (질문별):")
        for r in rag_results:
            m = r["rag_metrics"]
            pct = f"{m['recall'] * 100:.0f}%"
            missing = set(m["expected"]) - set(m["found"])
            miss_str = f"  누락: {', '.join(missing)}" if missing else ""
            print(f"    {r['id']}: {pct} ({len(m['found'])}/{len(m['expected'])}){miss_str}")

    # Failure detail
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
            print(f"    {r['id']} ({r['language']}): {', '.join(failed)}")
            for k, v in rules.items():
                if v.get("pass") is False:
                    print(f"      - {RULE_LABELS[k]}: {v.get('reason', '')}")
    print("=" * 66)


def _print_rule_row(rule: str, report: dict) -> None:
    rate = report["rule_rates"].get(rule)
    stats = report["rule_stats"][rule]
    rate_str = f"{rate:5.1f}%" if rate is not None else "  N/A "
    bar = "█" * int((rate or 0) / 10)
    na_str = f"  (N/A {stats['na']}건)" if stats["na"] > 0 else ""
    err_str = f"  (오류 {stats['error']}건)" if stats["error"] > 0 else ""
    print(f"  {RULE_LABELS[rule]:<22} {rate_str}   {bar}{na_str}{err_str}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser(
        description="LinguaRAG LLM-as-Judge Evaluator (Universal)"
    )
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
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Max concurrent evaluations (default: 2)",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Filter: only evaluate questions for this language (e.g. 독일어)",
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

    # Optional language filter
    if args.language:
        questions = [q for q in questions if q.get("language") == args.language]
        if not questions:
            print(f"Error: '{args.language}' 언어의 질문이 없습니다.")
            sys.exit(1)

    # Summary
    languages = sorted(set(q.get("language", "?") for q in questions))
    rag_count = sum(1 for q in questions if q.get("context"))
    print(f"LinguaRAG Evaluator — {len(questions)}개 질문 로드")
    print(f"  언어: {', '.join(languages)}")
    print(f"  RAG 컨텍스트 포함: {rag_count}개")
    print(f"  동시 실행: {args.concurrency}")
    print(f"  Tutor: {TUTOR_MODEL}  /  Judge: {JUDGE_MODEL}\n")

    client = anthropic.AsyncAnthropic(api_key=api_key)
    semaphore = asyncio.Semaphore(args.concurrency)

    async def evaluate_with_limit(q: dict, idx: int) -> dict:
        async with semaphore:
            return await evaluate_question(client, q, idx, len(questions))

    tasks = [
        evaluate_with_limit(q, i)
        for i, q in enumerate(questions, 1)
    ]
    results = await asyncio.gather(*tasks)

    report = compute_report(list(results))
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
