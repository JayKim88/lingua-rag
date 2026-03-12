# 임베딩 모델 비교 분석

> **목적**: LinguaRAG의 다국어 PDF RAG 검색에 최적인 임베딩 모델 선정
> **비교 대상**: OpenAI `text-embedding-3-small` (현행) vs `multilingual-e5-large` (대안)
> **작성일**: 2026-03-12

---

## 1. 모델 스펙 비교

| 항목 | text-embedding-3-small | multilingual-e5-large |
|------|----------------------|----------------------|
| **제공** | OpenAI API | HuggingFace (오픈소스) |
| **차원** | 1536 | 1024 |
| **Max Tokens** | 8191 | 512 |
| **다국어** | 100+ 언어 지원 | 100+ 언어 (MTEB multilingual 상위권) |
| **MTEB 평균** | 62.3 [FACT] | 61.6 (base), **64.2** (instruct) [FACT] |
| **MTEB Retrieval** | 51.7 [FACT] | **56.9** [FACT] |
| **비용** | $0.02 / 1M tokens | 무료 (self-host) |
| **인프라** | API 호출만 | GPU 서버 또는 HF Inference API |
| **Latency** | ~100ms (API) | ~200-500ms (HF API), ~50ms (local GPU) |

> **[FACT]** MTEB 스코어 출처: HuggingFace MTEB Leaderboard (2025-Q4 기준)

---

## 2. 다국어 검색 성능 비교

### 2.1 언어별 MTEB Retrieval 성능

| 언어 | text-embedding-3-small | multilingual-e5-large | 차이 |
|------|----------------------|----------------------|------|
| 영어 (EN) | **54.9** | 52.3 | -2.6 |
| 독일어 (DE) | 43.2 | **49.8** | +6.6 |
| 프랑스어 (FR) | 41.5 | **48.2** | +6.7 |
| 일본어 (JA) | 48.1 | **53.4** | +5.3 |
| 중국어 (ZH) | 50.2 | **55.1** | +4.9 |

> **[ESTIMATE]** 개별 언어 스코어는 MTEB 벤치마크의 해당 언어 서브셋 기준 추정.
> 실제 교재 PDF 도메인에서의 성능은 다를 수 있음.

### 2.2 크로스-링구얼 검색 (한국어 질문 → 외국어 청크)

LinguaRAG의 핵심 사용 패턴: **한국어로 질문 → 외국어 PDF 청크 검색**

| 시나리오 | text-embedding-3-small | multilingual-e5-large |
|----------|----------------------|----------------------|
| KO→DE | 보통 [ESTIMATE] | **강함** [ESTIMATE] |
| KO→EN | 양호 [ESTIMATE] | 양호 [ESTIMATE] |
| KO→JA | 양호 [ESTIMATE] | **강함** [ESTIMATE] |
| KO→ZH | 양호 [ESTIMATE] | **강함** [ESTIMATE] |

> **[ESTIMATE]** 크로스-링구얼 검색은 E5 모델이 명시적으로 학습한 영역.
> OpenAI 모델도 다국어를 지원하지만, 크로스-링구얼에 특화되지는 않음.

---

## 3. 비용 분석

### 3.1 현재 사용량 기준

| 항목 | text-embedding-3-small | multilingual-e5-large |
|------|----------------------|----------------------|
| **인덱싱 비용** (100 PDF, 평균 50페이지) | ~$0.07 | $0 (API) / $50-100/mo (GPU) |
| **쿼리 비용** (1,000 질문/월) | ~$0.001 | $0 (API) / 포함 |
| **월간 예상 총비용** | < $1 | $0 (HF free) / $50+ (self-host) |

### 3.2 스케일 시나리오 (1,000 유저, 10,000 PDF)

| 항목 | text-embedding-3-small | multilingual-e5-large |
|------|----------------------|----------------------|
| 인덱싱 | ~$7 (일회성) | $0 / GPU 비용 동일 |
| 월간 쿼리 (100K) | ~$0.10 | $0 / GPU 비용 동일 |
| **월간 총비용** | **< $10** | **$0 (HF API) / $50-100 (GPU)** |

> **[FACT]** OpenAI 임베딩 비용: $0.02/1M tokens (2026-03 기준)
>
> **핵심 인사이트**: OpenAI API 비용이 극도로 저렴하여 스케일 시에도 비용 차이가 미미함.
> self-host GPU 비용이 오히려 더 비쌈.

---

## 4. 인프라 영향도

### 4.1 현재 아키텍처 (text-embedding-3-small)

```
User Question → OpenAI API → 1536d vector → pgvector cosine search
PDF Upload → OpenAI API → 1536d vectors → document_chunks.embedding
```

- 장점: 인프라 단순, API 한 줄 호출
- 단점: OpenAI API 의존, 오프라인 불가

### 4.2 E5 전환 시 변경 사항

```
[변경 필요]
1. DB: vector(1536) → vector(1024) 컬럼 변경
2. 기존 청크 전체 재인덱싱 (모든 유저 PDF)
3. embedding_service.py: OpenAI → HuggingFace/local 전환
4. E5 전용 prefix 처리: "query: " / "passage: " 구분
5. (self-host 시) GPU 서버 + 모델 서빙 인프라
```

### 4.3 마이그레이션 난이도

| 항목 | 난이도 | 리스크 |
|------|--------|--------|
| DB 스키마 변경 | 중 | 다운타임 필요 |
| 재인덱싱 | 중 | 시간 소요 (PDF 수에 비례) |
| 코드 변경 | 낮음 | embedding_service.py만 수정 |
| E5 prefix 처리 | 낮음 | query/passage 분기 추가 |
| 인프라 (HF API 사용 시) | 낮음 | rate limit 주의 |
| 인프라 (self-host 시) | **높음** | GPU 서버 운영 부담 |

---

## 5. 벤치마크 실행 방법

```bash
# 환경 변수 설정
export OPENAI_API_KEY=sk-...
export HF_TOKEN=hf_...  # 선택 (HF free tier는 토큰 없이도 가능)

# 전체 비교 실행
python scripts/compare_embeddings.py --verbose

# 특정 언어만
python scripts/compare_embeddings.py --language 독일어 --verbose

# 결과 JSON 저장
python scripts/compare_embeddings.py --output results/embedding_bench.json
```

벤치마크는 `test_questions.json`의 RAG 질문(context 포함)을 사용:
- 정답 청크 + 다른 질문의 청크를 distractor로 구성
- Hit@1, Hit@3, MRR, 코사인 유사도 간격(separation) 측정

---

## 6. 의사결정 매트릭스

| 기준 (가중치) | text-embedding-3-small | multilingual-e5-large |
|--------------|----------------------|----------------------|
| 다국어 검색 품질 (30%) | 7/10 | **9/10** |
| 비용 효율 (25%) | **9/10** | 6/10 (HF API) / 3/10 (GPU) |
| 인프라 단순성 (20%) | **10/10** | 7/10 (HF API) / 3/10 (GPU) |
| 크로스-링구얼 (15%) | 6/10 | **9/10** |
| 마이그레이션 비용 (10%) | **10/10** (변경 없음) | 5/10 |
| **가중 점수** | **8.15** | **7.55** (HF API) / **5.75** (GPU) |

---

## 7. 결론 및 권장사항

### 현재 권장: text-embedding-3-small 유지

**근거:**
1. **[FACT]** 비용이 극도로 저렴 (월 $1 미만) — E5 self-host 대비 50배 이상 저렴
2. **[FACT]** 인프라 변경 없음 — API 한 줄 호출, 운영 부담 제로
3. **[ESTIMATE]** 다국어 성능 차이가 실 서비스에서 체감되지 않을 가능성 높음
   - Hybrid Search(BM25+vector)가 이미 검색 품질을 크게 보완
   - 교재 PDF는 특정 언어 중심이라 cross-lingual 시나리오가 주가 아님

### E5 전환이 합리적인 시점

- 유저 수 1,000+ 이상으로 API 비용이 월 $50 이상 발생 시
- cross-lingual 검색이 핵심 UX가 될 때 (예: 다국어 교재 혼합 검색)
- OpenAI API 의존에서 벗어나야 하는 비즈니스 요구 발생 시

### 반론 (Counter-argument)
E5의 크로스-링구얼 성능은 실측 없이 판단하기 어렵다. 한국어 질문 → 독일어 PDF 청크 검색에서 OpenAI 모델이 예상보다 약할 수 있으며, 이 경우 벤치마크 결과에 따라 판단이 바뀔 수 있다. `scripts/compare_embeddings.py`를 실행하여 실 데이터로 검증할 것을 권장한다.

---

## 부록: 기타 후보 모델

| 모델 | 차원 | 특징 | 비고 |
|------|------|------|------|
| text-embedding-3-large | 3072 | OpenAI 최상위 | 비용 6배, 성능 소폭 향상 |
| Cohere embed-multilingual-v3.0 | 1024 | 다국어 특화 | $0.10/1M tokens |
| voyage-multilingual-2 | 1024 | 다국어 우수 | $0.12/1M tokens |
| BGE-M3 | 1024 | 오픈소스, dense+sparse | self-host 필요 |
| nomic-embed-text-v1.5 | 768 | 오픈소스, 경량 | Matryoshka 지원 |
