# LinguaRAG - TODO / Backlog

> AI Engineering (Chip Huyen, 2025) 분석 기반으로 도출한 개선 항목.
> 우선순위는 ROI(효과 대비 노력) 기준.
>
> **전략적 맥락 (2026-03-03 기준)**
> - lingua-rag = 실제 제품 (실사용자 확보 목표) + eval 레이어 (포트폴리오 핵심 증거)
> - 포트폴리오 스토리: "RAG 앱을 만들었는데 품질 측정이 안됐다 → LLM-as-judge eval 도구 직접 만들어 X→Y% 개선"
> - 현재 가장 취약한 부분: 실사용자 0명, eval 수치 없음
>
> **운영 원칙**
> - 이 파일이 단일 소스. wrap-up Next 섹션은 세션 기록용 (정합성 관리 대상 외)
> - v0.x 완료 또는 방향 전환 시에만 이 파일 업데이트

---

## 완료

- [x] **Prompt Caching 적용** — 2026-03-03
  - `claude_service.py`: fixed_prefix(~1,300 tokens)에 `cache_control: ephemeral` 적용
  - fixed_prefix = TUTOR_ROLE + level modifier + UNIT_SUMMARY_TABLE

- [x] **"Lost in the Middle" 프롬프트 구조 개선** — 2026-03-03
  - RAG chunks를 dynamic_suffix 앞에 prepend (기존: 뒤에 append)

- [x] **LLM-as-Judge 평가 시스템 구축** — 2026-03-03
  - `scripts/test_questions.json`: 10개 고정 테스트 질문 (단원별 포맷 유혹 케이스 포함)
  - `scripts/evaluate.py`: 6규칙 judge runner (Sonnet judge, JSON 리포트 출력)
  - Baseline → 프롬프트 개선 후 83.3% → 90.0% 달성
  - ANSWER_FORMAT 강화: 괄호 안·헤딩·국가명·형태소 bold 예시 추가
  - `getText()` fallback 개선: Korean strip → Latin 단어 추출

---

## v0.3 — 진행 중 / 남은 작업

---

## 단기 (Medium effort / High impact)

- [x] **User Feedback UI** — v0.3 Phase 2 — 2026-03-04
  - 응답 하단 thumbs up/down UI (isSummary 제외, 토글 지원)
  - backend: `PATCH /api/messages/{id}/feedback` + messages 테이블 feedback 컬럼
  - 목적: eval 결과와 사용자 체감 품질 상관관계 확인

- [x] **Monitoring 강화** (Ch. 10) — 2026-03-04
  - `messages.token_count` 실기록 (output_tokens from Claude API usage)
  - `messages.rag_hit` BOOLEAN 추가 — 단원별 RAG 히트율 추적 가능
  - 로그: `Token usage — unit=%s out=%d in=%d cache_read=%d cache_write=%d`
  - 변경 파일: `claude_service.py`, `chat.py`, `repositories.py`, `schema.sql`

- [ ] **P0-1: german_bold_complete 프롬프트 개선** — Eval 이터레이션 2라운드
  - 실패 패턴 5종 확인: 형태소(`ge-`/`-en`), 변환 표기(`ein → kein`), 언어학 용어(`Dativ`), 팁 섹션
  - `prompts.py` ANSWER_FORMAT에 이 패턴들의 명시적 예시 추가
  - 목표: 40% → 70%+ 달성
  - 변경 파일: `backend/app/data/prompts.py`, `scripts/evaluate.py` 재실행

- [ ] **P0-2: Eval v2 — 의미론적 규칙 추가**
  - 현재 eval은 포맷 준수율만 측정. "좋은 튜터인가?"는 미측정
  - 추가 규칙: `correct_level` (A1 수준 적합성), `example_relevance` (예문-문법 연관성)
  - 변경 파일: `scripts/evaluate.py`, `scripts/test_questions.json`

- [ ] **P1-1: GitHub Actions eval CI 파이프라인**
  - 트리거: push to main (backend/ 변경 시)
  - 5개 핵심 질문 실행 (비용 절감), 점수 < 85% 시 경고
  - 변경 파일: `.github/workflows/eval.yml` (신규), `scripts/evaluate.py` (--questions 옵션)

- [ ] **Multi-turn Query Rewriting** — v0.3 Phase 3 (RAG 재활성화 후)
  - "이 문장 다시 설명해줘" 같은 후속 질문을 독립 문장으로 재작성 후 RAG 검색
  - 방식: 경량 Claude 호출 or 템플릿 기반 컨텍스트 주입
  - 변경 파일: `chat.py`, `embedding_service.py`
  - 전제 조건: `RAG_ENABLED=True` 복원 후

---

## 중기 (Strategic value)

- [ ] **P3: 피드백-Eval 상관관계 분석** (실사용자 피드백 20개+ 수집 후)
  - SQL: 단원별 thumbs-up 비율 vs eval 점수 매핑
  - 목적: "eval 수치가 실사용자 만족도를 예측하는가" 데이터 증명 (측정 루프 완결)

- [ ] **P4: Evaluation Framework — RAGAS** (Ch. 3-4, 실사용자 50명+ 후)
  - context relevance, groundedness, answer relevance 3종
  - 전제 조건: 골든 데이터셋 확보, RAG_ENABLED=True 복원

- [ ] **임베딩 모델 평가** — 독일어 RAG 품질 최적화
  - 현재: `text-embedding-3-small` (영어 위주)
  - 비교: `multilingual-e5-large` (다국어 특화)
  - 전제 조건: Evaluation Framework 구축 후

- [ ] **STT 검토** — 외부 API vs Web Speech API
  - 현재 Web Speech API는 브라우저/OS 의존성 높음
  - 후보: OpenAI Whisper API

- [ ] **Progress Tracking UX**
  - 완료 단원 처리 방식 미결정 (버튼 vs 자동 체크)
  - 출처: wireframe-spec.md

---

## 실사용자 확보 (P2)

> 포트폴리오 스토리의 전제 조건. 실사용자 없이는 eval 데이터도, 피드백도 없음.

- [ ] **채널 선정** — 독일어 학습 커뮤니티 1개 선택
  - 후보: Reddit r/German, Discord 독일어 학습 서버, Naver 카페 (독일어 학습)
  - 목표: 베타 사용자 10~20명

- [ ] **베타 온보딩**
  - 소개 게시물 작성 + 피드백 수집 채널 마련

---

## 장기 / 보류

- [ ] **Finetuning 검토** (Ch. 7)
  - 재검토 시점: 사용자 1,000명 이상 or A2 교재 추가 시

---

## 적용 제외 (명시적 결정)

| 기법 | 이유 |
|------|------|
| Agents / ReAct (Ch. 6) | 튜터링 Q&A에 불필요한 복잡도 |
| Semantic Caching (Ch. 10) | 저자 본인이 "가치 의심스럽다"고 결론. 히트율 불투명 |
| 하드웨어 최적화 / KV cache (Ch. 9) | Anthropic API 사용 → 자체 인프라 없음 |
| Model Router (Ch. 10) | 프롬프트 constraints로 충분히 처리 중 |
