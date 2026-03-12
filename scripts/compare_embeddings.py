"""
Embedding model comparison benchmark.

Compares retrieval quality between:
  - text-embedding-3-small (OpenAI, 1536d) — current production model
  - multilingual-e5-large (HuggingFace, 1024d) — multilingual specialist

Metrics:
  - Hit@K: whether the correct chunk appears in top-K results
  - MRR (Mean Reciprocal Rank): 1/rank of first correct result
  - Cosine similarity distribution: query-to-correct-chunk scores

Usage:
  python scripts/compare_embeddings.py
  python scripts/compare_embeddings.py --language 독일어
  python scripts/compare_embeddings.py --verbose

Requires:
  pip install openai requests numpy
  Environment: OPENAI_API_KEY
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import numpy as np
import requests
from openai import OpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

OPENAI_MODEL = "text-embedding-3-small"
OPENAI_DIM = 1536

HF_MODEL = "intfloat/multilingual-e5-large"
HF_API_URL = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{HF_MODEL}"
HF_DIM = 1024

# E5 models require "query: " or "passage: " prefix
E5_QUERY_PREFIX = "query: "
E5_PASSAGE_PREFIX = "passage: "


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    return float(dot / norm) if norm > 0 else 0.0


# ---------------------------------------------------------------------------
# Embedding clients
# ---------------------------------------------------------------------------


class OpenAIEmbedder:
    def __init__(self):
        self.client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = self.client.embeddings.create(input=texts, model=OPENAI_MODEL)
        return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]

    @property
    def name(self) -> str:
        return OPENAI_MODEL

    @property
    def dimensions(self) -> int:
        return OPENAI_DIM


class HuggingFaceE5Embedder:
    """Uses HuggingFace Inference API (free tier, rate-limited)."""

    def __init__(self):
        self.token = os.environ.get("HF_TOKEN", "")
        self.headers = {}
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"

    def embed_batch(self, texts: list[str], max_retries: int = 3) -> list[list[float]]:
        for attempt in range(max_retries):
            resp = requests.post(
                HF_API_URL,
                headers=self.headers,
                json={"inputs": texts, "options": {"wait_for_model": True}},
                timeout=120,
            )
            if resp.status_code == 503:
                # Model loading
                wait = resp.json().get("estimated_time", 30)
                logger.info("HF model loading, waiting %.0fs...", wait)
                time.sleep(min(wait, 60))
                continue
            if resp.status_code == 429:
                logger.warning("HF rate limited, waiting 10s...")
                time.sleep(10)
                continue
            resp.raise_for_status()
            break
        else:
            raise RuntimeError("HF API failed after retries")

        data = resp.json()
        # HF returns list of embeddings, each is list[list[float]] (token-level)
        # For sentence embedding, we need to mean-pool token embeddings
        embeddings = []
        for item in data:
            if isinstance(item[0], list):
                # Token-level: mean pool
                arr = np.array(item)
                pooled = arr.mean(axis=0).tolist()
                embeddings.append(pooled)
            else:
                embeddings.append(item)
        return embeddings

    @property
    def name(self) -> str:
        return HF_MODEL

    @property
    def dimensions(self) -> int:
        return HF_DIM


# ---------------------------------------------------------------------------
# Benchmark data
# ---------------------------------------------------------------------------


def build_benchmark(questions: list[dict]) -> list[dict]:
    """Build retrieval benchmark from test_questions.json.

    For RAG questions (with context), we create:
    - query: the question
    - corpus: the correct context chunks + distractor chunks from other questions
    - correct_indices: which corpus items are the correct answer

    For non-RAG questions, we skip (no ground truth for retrieval).
    """
    # Collect all contexts as potential distractors
    all_contexts = []
    for q in questions:
        if q.get("context"):
            for ctx in q["context"]:
                all_contexts.append({"text": ctx, "source_id": q["id"]})

    benchmarks = []
    for q in questions:
        if not q.get("context"):
            continue

        # Build corpus: correct chunks first, then distractors
        corpus = []
        correct_indices = []
        for ctx in q["context"]:
            correct_indices.append(len(corpus))
            corpus.append(ctx)

        # Add distractors from other questions
        for item in all_contexts:
            if item["source_id"] != q["id"]:
                corpus.append(item["text"])

        benchmarks.append(
            {
                "id": q["id"],
                "language": q["language"],
                "query": q["question"],
                "corpus": corpus,
                "correct_indices": correct_indices,
            }
        )

    return benchmarks


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_model(embedder, benchmarks: list[dict], k_values: list[int], verbose: bool = False) -> dict:
    """Run retrieval benchmark for a single embedding model."""
    results = {f"hit@{k}": [] for k in k_values}
    results["mrr"] = []
    results["correct_sim"] = []
    results["avg_distractor_sim"] = []
    results["per_query"] = []

    for bench in benchmarks:
        query = bench["query"]
        corpus = bench["corpus"]

        # E5 models need prefixed inputs
        if "e5" in embedder.name.lower():
            query_input = [E5_QUERY_PREFIX + query]
            corpus_input = [E5_PASSAGE_PREFIX + c for c in corpus]
        else:
            query_input = [query]
            corpus_input = corpus

        # Embed
        query_emb = embedder.embed_batch(query_input)[0]
        corpus_embs = embedder.embed_batch(corpus_input)

        # Compute similarities
        sims = [(i, cosine_similarity(query_emb, c_emb)) for i, c_emb in enumerate(corpus_embs)]
        sims.sort(key=lambda x: x[1], reverse=True)

        ranked_indices = [idx for idx, _ in sims]
        correct_set = set(bench["correct_indices"])

        # Hit@K
        for k in k_values:
            hit = any(idx in correct_set for idx in ranked_indices[:k])
            results[f"hit@{k}"].append(1.0 if hit else 0.0)

        # MRR
        rr = 0.0
        for rank, idx in enumerate(ranked_indices, 1):
            if idx in correct_set:
                rr = 1.0 / rank
                break
        results["mrr"].append(rr)

        # Similarity scores
        correct_sims = [s for i, s in sims if i in correct_set]
        distractor_sims = [s for i, s in sims if i not in correct_set]
        results["correct_sim"].append(np.mean(correct_sims))
        if distractor_sims:
            results["avg_distractor_sim"].append(np.mean(distractor_sims))

        query_result = {
            "id": bench["id"],
            "language": bench["language"],
            "correct_rank": ranked_indices.index(bench["correct_indices"][0]) + 1,
            "correct_sim": round(correct_sims[0], 4),
            "top_distractor_sim": round(distractor_sims[0], 4) if distractor_sims else None,
            "separation": round(correct_sims[0] - (distractor_sims[0] if distractor_sims else 0), 4),
        }
        results["per_query"].append(query_result)

        if verbose:
            logger.info(
                "  %s [%s]: rank=%d, sim=%.4f (top distractor=%.4f, gap=%.4f)",
                bench["id"],
                bench["language"],
                query_result["correct_rank"],
                query_result["correct_sim"],
                query_result["top_distractor_sim"] or 0,
                query_result["separation"],
            )

    return results


def print_report(model_results: dict[str, dict], k_values: list[int]):
    """Print comparison report."""
    print("\n" + "=" * 70)
    print("임베딩 모델 비교 벤치마크 결과")
    print("=" * 70)

    # Summary table
    headers = ["Metric"] + list(model_results.keys())
    rows = []

    for k in k_values:
        metric = f"Hit@{k}"
        vals = [f"{np.mean(r[f'hit@{k}']) * 100:.1f}%" for r in model_results.values()]
        rows.append([metric] + vals)

    rows.append(["MRR"] + [f"{np.mean(r['mrr']):.4f}" for r in model_results.values()])
    rows.append(["Correct Sim (avg)"] + [f"{np.mean(r['correct_sim']):.4f}" for r in model_results.values()])
    rows.append(
        ["Distractor Sim (avg)"]
        + [
            f"{np.mean(r['avg_distractor_sim']):.4f}" if r["avg_distractor_sim"] else "N/A"
            for r in model_results.values()
        ]
    )

    # Separation (correct - distractor)
    sep_vals = []
    for r in model_results.values():
        if r["avg_distractor_sim"]:
            sep = np.mean(r["correct_sim"]) - np.mean(r["avg_distractor_sim"])
            sep_vals.append(f"{sep:.4f}")
        else:
            sep_vals.append("N/A")
    rows.append(["Separation (gap)"] + sep_vals)

    # Print table
    col_widths = [max(len(str(row[i])) for row in [headers] + rows) for i in range(len(headers))]
    fmt = "  ".join(f"{{:<{w}}}" for w in col_widths)

    print()
    print(fmt.format(*headers))
    print("  ".join("-" * w for w in col_widths))
    for row in rows:
        print(fmt.format(*row))

    # Per-query comparison
    print("\n" + "-" * 70)
    print("질문별 상세 결과")
    print("-" * 70)

    model_names = list(model_results.keys())
    all_queries = model_results[model_names[0]]["per_query"]

    for i, q in enumerate(all_queries):
        print(f"\n  [{q['id']}] {q['language']}")
        for model_name in model_names:
            pq = model_results[model_name]["per_query"][i]
            print(
                f"    {model_name:<35s}  rank={pq['correct_rank']}  "
                f"sim={pq['correct_sim']:.4f}  gap={pq['separation']:.4f}"
            )

    # Winner summary
    print("\n" + "-" * 70)
    print("종합 판정")
    print("-" * 70)

    for k in k_values:
        scores = {name: np.mean(r[f"hit@{k}"]) for name, r in model_results.items()}
        winner = max(scores, key=lambda x: scores[x])
        tied = all(v == list(scores.values())[0] for v in scores.values())
        if tied:
            print(f"  Hit@{k}: 동점")
        else:
            print(f"  Hit@{k}: {winner} 승 ({scores[winner] * 100:.1f}%)")

    mrr_scores = {name: np.mean(r["mrr"]) for name, r in model_results.items()}
    winner = max(mrr_scores, key=lambda x: mrr_scores[x])
    print(f"  MRR: {winner} 승 ({mrr_scores[winner]:.4f})")

    sep_scores = {}
    for name, r in model_results.items():
        if r["avg_distractor_sim"]:
            sep_scores[name] = np.mean(r["correct_sim"]) - np.mean(r["avg_distractor_sim"])
    if sep_scores:
        winner = max(sep_scores, key=lambda x: sep_scores[x])
        print(f"  Separation: {winner} 승 ({sep_scores[winner]:.4f})")


def save_results(model_results: dict[str, dict], output_path: str):
    """Save raw results to JSON for further analysis."""
    serializable = {}
    for name, r in model_results.items():
        serializable[name] = {
            "hit@1": float(np.mean(r["hit@1"])),
            "hit@3": float(np.mean(r["hit@3"])),
            "mrr": float(np.mean(r["mrr"])),
            "correct_sim_avg": float(np.mean(r["correct_sim"])),
            "distractor_sim_avg": float(np.mean(r["avg_distractor_sim"])) if r["avg_distractor_sim"] else None,
            "per_query": r["per_query"],
        }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(serializable, f, indent=2, ensure_ascii=False)
    logger.info("Results saved to %s", output_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Compare embedding models for multilingual RAG retrieval")
    parser.add_argument("--language", help="Filter by language (e.g., 독일어)")
    parser.add_argument("--verbose", action="store_true", help="Show per-query details during evaluation")
    parser.add_argument("--output", default="scripts/embedding_comparison_results.json", help="Output JSON path")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["openai", "e5"],
        choices=["openai", "e5"],
        help="Models to compare",
    )
    args = parser.parse_args()

    # Load test questions
    questions_path = Path(__file__).parent / "test_questions.json"
    with open(questions_path, encoding="utf-8") as f:
        questions = json.load(f)

    if args.language:
        questions = [q for q in questions if q["language"] == args.language]
        logger.info("Filtered to %d questions for language: %s", len(questions), args.language)

    # Build benchmark (only RAG questions with context)
    benchmarks = build_benchmark(questions)
    if not benchmarks:
        logger.error("No RAG questions with context found. Cannot run retrieval benchmark.")
        sys.exit(1)

    corpus_sizes = [len(b["corpus"]) for b in benchmarks]
    logger.info("Benchmark: %d retrieval queries, corpus sizes: %s", len(benchmarks), corpus_sizes)

    k_values = [1, 3]
    model_results = {}

    # Run evaluations
    for model_key in args.models:
        if model_key == "openai":
            if not os.environ.get("OPENAI_API_KEY"):
                logger.warning("OPENAI_API_KEY not set, skipping OpenAI model")
                continue
            embedder = OpenAIEmbedder()
        elif model_key == "e5":
            embedder = HuggingFaceE5Embedder()

        logger.info("Evaluating: %s (%dd)", embedder.name, embedder.dimensions)
        results = evaluate_model(embedder, benchmarks, k_values, verbose=args.verbose)
        model_results[embedder.name] = results

    if len(model_results) < 2:
        logger.warning(
            "Only %d model(s) evaluated. Set OPENAI_API_KEY and/or HF_TOKEN for full comparison.",
            len(model_results),
        )

    if model_results:
        print_report(model_results, k_values)
        save_results(model_results, args.output)


if __name__ == "__main__":
    main()
