# LinguaRAG — AI Product Engineer 포트폴리오 스토리

> 작성일: 2026-03-03
> 목적: 이력서/면접에서 이 프로젝트로 무엇을 증명할 수 있는지 정리

---

## 1. 핵심 서사 (One-liner)

> "RAG 기반 독일어 튜터 앱을 만들고, 응답 품질을 측정할 방법이 없다는 걸 깨달았다.
> LLM-as-Judge 평가 시스템을 직접 설계해 포맷 준수율 83.3% → 90.0%로 개선했다."

이 서사의 구조: **문제 인식 → 도구 부재 → 직접 구현 → 측정 가능한 개선**
단순히 "AI 앱을 만들었다"가 아니라, **품질을 어떻게 정의하고 측정했는가**가 핵심이다.

---

## 2. AI Product Engineer 역량 매핑

### 2-1. 이미 증명된 것

| 역량 영역 | 구체적 증거 | 파일/위치 |
|----------|------------|----------|
| **Eval 설계** | LLM-as-judge 시스템 직접 구현. 6가지 규칙(bold 완결성, 표 금지, 번역 배치 등) 정의 + baseline 측정 + 개선 루프 | `scripts/evaluate.py`, `scripts/test_questions.json` |
| **프롬프트 아키텍처** | 6-layer 시스템 프롬프트. fixed_prefix(~1,300 tokens) / dynamic_suffix 분리. "Lost in the Middle" 고려한 RAG chunk 배치 | `backend/app/data/prompts.py` |
| **Prompt Caching** | fixed_prefix에 `cache_control: ephemeral` 적용. 캐시 가능 영역과 불가능 영역을 구조적으로 분리 | `backend/app/services/claude_service.py` |
| **RAG 파이프라인** | PDF 파싱, 단원 감지 패턴 설계, 청킹 전략, pgvector 벡터 검색, max_distance 튜닝, 품질 디버깅 | `scripts/index_pdf.py`, `backend/app/db/repositories.py` |
| **비용/지연 트레이드오프** | Judge 모델을 Haiku → Sonnet으로 교체한 이유: 정확도 vs 비용 판단. Prompt Caching으로 반복 요청 비용 절감 | `scripts/evaluate.py`, `claude_service.py` |
| **기법 선택 판단력** | Agents, Semantic Caching, Model Router를 명시적으로 기각한 근거 기록 | `docs/todo.md` 적용 제외 섹션 |
| **프롬프트 이터레이션** | eval 결과로 ANSWER_FORMAT의 구체적 실패 패턴 식별 → 예시 추가 → 재측정 | `backend/app/data/prompts.py` ANSWER_FORMAT |

### 2-2. 아직 증명이 안 된 것 (= 다음 작업 근거)

| 역량 영역 | 현재 상태 | 다음 작업 |
|----------|----------|----------|
| **Observability** | ✅ token_count, rag_hit 실기록. 구조화 로그 완료 (2026-03-04) | — |
| **사용자 피드백 루프** | ✅ 👍/👎 UI + PATCH API + DB 완료 (2026-03-04) | 실사용자 데이터 수집 |
| **Eval 완결성** | 90% 달성, 실패 분석 미완성 | **P0-1**: 실패 패턴 분류 + 프롬프트 개선 → 40% → 70%+ |
| **Eval 범위** | 포맷 준수율만 측정. 의미론적 품질 미측정 | **P0-2**: correct_level, example_relevance 등 규칙 추가 |
| **Eval 자동화** | 완전 수동 실행 | **P1-1**: GitHub Actions CI 파이프라인 |
| **실사용자 데이터** | 0명. 합성 질문 10개만 | **P2**: 커뮤니티 채널 베타 사용자 확보 |
| **피드백↔Eval 상관관계** | 인프라 있음, 데이터 없음 | **P3**: 피드백 20개+ 수집 후 SQL 분석 |
| **RAG 품질 지표** | RAG 비활성화. groundedness 미측정 | **P4**: 실사용자 50명+ 후 RAGAS 도입 |

---

## 3. 깊은 이해도를 증명해야 할 핵심 질문

면접에서 이 프로젝트로 받을 가능성이 높은 질문과 답변 포인트:

### Q1. "LLM-as-Judge를 왜 선택했나요? 한계는 뭔가요?"
**답변 포인트:**
- 골든 데이터셋 없이 시작 가능 → 실사용자 0명 상태에서도 품질 측정 가능
- 규칙 기반 검사(regex)로 대체 가능한 항목(표 금지, 팁 포함)도 있었지만, "독일어 bold 완결성"은 문맥 이해가 필요해 LLM이 적합
- 한계: Judge 자체가 틀릴 수 있음. Haiku → Sonnet 교체 이유가 바로 이것. Judge 정확도가 eval 신뢰도의 상한선

### Q2. "Prompt Caching은 어떻게 구현했고, 얼마나 효과가 있었나요?"
**답변 포인트:**
- fixed_prefix(TUTOR_ROLE + level modifier + 56단원 요약표, ~1,300 tokens)를 `cache_control: ephemeral`로 마킹
- dynamic_suffix(현재 단원 + ANSWER_FORMAT + 제약조건)는 단원마다 달라서 캐시 불가
- 효과: 같은 단원에서 연속 질문 시 ~1,300 tokens 재계산 절감. 캐시 히트율은 같은 단원 내 대화 비율에 비례

### Q3. "RAG를 현재 꺼놨는데 왜 그런가요?"
**답변 포인트:**
- Vision(page_image)이 이미 교재 직접 참조를 제공. RAG와 중복되는 컨텍스트
- 추가 지연 + 비용 대비 명확한 품질 향상 미확인
- `RAG_ENABLED` 플래그로 언제든 재활성화 가능. 재활성화 시점: RAGAS로 검색 품질 측정 가능해진 후

### Q4. "eval 점수 90%인데 나머지 10%는 무엇인가요?"
**답변 포인트:**
- `german_bold_complete` 규칙이 40%로 가장 낮음
- 실패 패턴: 헤딩 안 독일어, 괄호 안 문법 용어, 형태소(ge-, -t) 누락
- 이것들은 TTS 추출에 직접 영향 없는 케이스가 많음 → 우선순위 낮게 판단
- 단, 사용자 체감 품질과의 상관관계는 아직 미측정

### Q5. "프롬프트 엔지니어링에서 가장 어려운 부분이 뭐였나요?"
**답변 포인트:**
- 규칙을 프롬프트에 기술하는 것과 모델이 그 규칙을 일관되게 따르는 것은 다름
- "괄호 안 독일어도 bold"라는 규칙을 적어도 모델은 자주 누락. 구체적 예시(`남성 명사(**der**)는`)를 추가하자 준수율 상승
- 즉, 규칙은 선언이 아니라 예시로 학습시켜야 함

---

## 4. 포트폴리오 서사 전체 흐름

```
v0.1: 스트리밍 Q&A 튜터 앱 구현
  └─ 문제: 응답 품질을 어떻게 측정하나?

v0.2: RAG 파이프라인 추가
  └─ PDF 파싱 → 벡터 검색 → 시스템 프롬프트 주입
  └─ 문제: RAG가 실제로 도움이 되는지 측정 방법 없음

v0.3: 품질 측정 레이어 구축
  ├─ Phase 1: LLM-as-Judge eval 시스템
  │   ├─ 6가지 포맷 규칙 정의 + 테스트셋 구성
  │   ├─ Baseline: 83.3%
  │   ├─ 프롬프트 개선 (구체적 예시 추가)
  │   └─ 개선 후: 90.0%
  ├─ Phase 2 (예정): 사용자 피드백 루프 (👍/👎)
  └─ Phase 3 (예정): RAGAS — RAG 검색 품질 측정

목표: "eval 수치 + 사용자 피드백 상관관계"까지 완성
```

---

## 5. 이 프로젝트로 지원 가능한 포지션

| 포지션 | 적합도 | 근거 |
|--------|--------|------|
| AI Product Engineer | ★★★★★ | Eval + 프롬프트 아키텍처 + 풀스택 구현 + 제품 판단력 |
| AI Application Developer | ★★★★☆ | 실사용자 데이터 없는 점이 약점 |
| ML Engineer | ★★☆☆☆ | 모델 학습/파인튜닝 없음. RAG 품질 지표 미완성 |
| Backend Engineer (AI 서비스) | ★★★★☆ | FastAPI + SSE + asyncpg + Supabase 운영 경험 |

---

## 6. 포트폴리오 스토리 완성 시나리오

```
현재 (2026-03-04):
  "RAG 튜터 앱 제작 → 품질 측정 문제 발견 → LLM-as-Judge 직접 구현
   → 포맷 준수율 83.3% → 90.0% 달성"

P0 완료 후:
  + "90%에서 멈추지 않고 실패 패턴 분석(형태소, 변환 표기, 팁 섹션)
     → german_bold_complete 40% → 70%+ 달성"
  + "포맷 측정 eval의 한계 인식 → 의미론적 규칙(correct_level, example_relevance) 추가"

P1 완료 후:
  + "매 배포마다 eval 자동 실행 → 품질 회귀를 CI에서 차단"

P2+P3 완료 후:
  + "베타 사용자 피드백 vs eval 점수 상관관계 확인
     → eval 수치가 실사용자 만족도를 예측하는가 데이터로 증명 (측정 루프 완결)"
```

### 우선순위 (2026-03-04 기준)

| 순위 | 작업 | 기대 효과 |
|------|------|----------|
| **P0-1** | german_bold_complete 프롬프트 개선 | eval 이터레이션 2라운드 증거 |
| **P0-2** | Eval v2 의미론적 규칙 추가 | "좋은 튜터인가?" 측정 가능 |
| **P1-1** | GitHub Actions eval CI | 운영 마인드셋 증거 |
| **P2** | 베타 사용자 10-20명 확보 | 실사용자 데이터 확보 |
| **P3** | 피드백-Eval 상관관계 분석 | 측정 루프 완결 |
