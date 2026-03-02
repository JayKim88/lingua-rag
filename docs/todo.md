# LinguaRAG - TODO / Backlog

> AI Engineering (Chip Huyen, 2025) 분석 기반으로 도출한 개선 항목.
> 우선순위는 ROI(효과 대비 노력) 기준.
>
> **전략적 맥락 (2026-03-02 기준)**
> - lingua-rag = 실제 제품 (실사용자 확보 목표) + DocuMind eval 레이어 (포트폴리오 핵심 증거)
> - 포트폴리오 스토리: "RAG 앱을 만들었는데 품질 측정이 안됐다 → eval 도구 직접 만들어 X→Y% 개선"
> - 현재 가장 취약한 부분: 실사용자 0명, RAGAS 수치 없음

---

## 즉시 (Low effort / High impact)

- [ ] **Prompt Caching 적용** (Ch. 9)
  - `claude_service.py`에서 system prompt 고정 prefix에 `cache_control: ephemeral` 추가
  - 대상: 역할 선언 + ANSWER_FORMAT + 56-unit 요약 테이블 (~1,500 tokens)
  - 예상 효과: 요청당 비용 -60~90%, 첫 토큰 지연 -31~79%
  - 검증: Anthropic 대시보드의 `cache_read_input_tokens` 확인

- [ ] **"Lost in the Middle" 프롬프트 구조 개선** (Ch. 5)
  - `prompts.py`에서 현재 단원 상세 + RAG chunks를 prompt 앞쪽으로, 56-unit 테이블을 뒤쪽으로 재배치
  - 근거: 모델은 긴 컨텍스트 중간 정보를 가장 잘 참조하지 못함 (Liu et al., 2023)
  - 검증: 동일 질문에 대한 응답 품질 체감 비교

---

## 단기 (Medium effort / High impact)

- [ ] **Multi-turn Query Rewriting** (Ch. 5)
  - 대화 기록 최근 3~5턴을 기반으로 RAG 검색 전 쿼리를 독립적 문장으로 재작성
  - 문제: "이 문장 다시 설명해줘" 같은 후속 질문은 맥락 없이 임베딩되어 RAG 검색 품질 저하
  - 방식: 경량 Claude 호출 or 템플릿 기반 컨텍스트 주입
  - 변경 파일: `chat.py`, `embedding_service.py`
  - 검증: RAG 히트율 A/B 비교 (with/without rewriting)

- [ ] **Monitoring 강화** (Ch. 10)
  - `messages` 테이블의 `token_count` 컬럼 실제 값 기록 (현재 unused)
  - 추가 지표: 대화 평균 턴 수, 응답 중간 중단율, 단원별 RAG 히트율
  - 변경 파일: `chat.py`, `repositories.py`

---

## 중기 (Medium effort / Strategic value)

- [ ] **Evaluation Framework 구축** (Ch. 3-4)
  - RAG 평가 3종 (RAGAS): context relevance, groundedness, answer relevance
  - AI-as-Judge: "이 답변이 A1 레벨 학습자에게 적절한가?" (Claude 자체 평가)
  - Synthetic test set: 단원별 테스트 질문 자동 생성 (GPT-4 또는 Claude)
  - 인프라: 별도 `scripts/evaluate.py` 스크립트 또는 CI 파이프라인
  - 전제 조건: 골든 데이터셋 확보 (사용자 수 증가 후 진행)

- [ ] **User Feedback 수집** (Ch. 10 — Data Flywheel)
  - 응답 하단에 thumbs up/down UI 추가
  - backend: `POST /api/feedback` 엔드포인트 + `message_feedback` DB 테이블
  - 목적: 추후 평가 데이터 또는 프롬프트 개선 근거로 활용

- [ ] **임베딩 모델 평가** — 독일어 RAG 품질 최적화
  - 현재: `text-embedding-3-small` (영어 위주 학습)
  - 비교 대상: `multilingual-e5-large` (다국어 특화)
  - 가설: 독일어 텍스트의 의미를 더 정확하게 벡터화 → 검색 품질 향상
  - 방법: 동일 테스트 질문셋으로 두 모델 RAGAS 점수 비교
  - 전제 조건: Evaluation Framework 구축 후 진행

---

## 실사용자 확보

> 포트폴리오 스토리의 전제 조건. 실사용자 없이는 eval 데이터도, 피드백도 없음.

- [ ] **채널 선정** — 독일어 학습 커뮤니티 1개 선택
  - 후보: Reddit r/German, Discord 독일어 학습 서버, Tandem 커뮤니티, Naver 카페 (독일어 학습)
  - 목표: 베타 사용자 10~20명 확보

- [ ] **베타 온보딩**
  - 간단한 소개 게시물 작성 (무료, 독일어 AI 튜터)
  - 피드백 수집 채널 마련 (Discord, 이메일)

---

## 장기 / 보류

- [ ] **Finetuning 검토** (Ch. 7)
  - 조건: 현재 프롬프트로 달성 불가한 스타일 일관성 문제가 생길 때
  - 현재는 RAG + 프롬프트로 충분 → 과투자
  - 재검토 시점: 사용자 수 1,000명 이상 or 교재 A2 추가 시

---

## 적용 제외 (명시적 결정)

| 기법 | 이유 |
|------|------|
| Agents / ReAct (Ch. 6) | 튜터링 Q&A에 불필요한 복잡도 |
| Semantic Caching (Ch. 10) | 저자 본인이 "가치 의심스럽다"고 결론. 캐시 키 설계 비용 대비 히트율 불투명 |
| 하드웨어 최적화 / KV cache (Ch. 9) | Anthropic API 사용 → 자체 인프라 없음 |
| Model Router (Ch. 10) | 프롬프트 constraints로 충분히 처리 중 |
