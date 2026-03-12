# LinguaRAG - TODO / Backlog

> **전략적 맥락 (2026-03-11)**
> - 피벗: 독일어 전용 튜터 → **범용 AI PDF 언어학습 서비스**
> - 타겟 포지션: AI Product Engineer / AI Fullstack Engineer (초기 AI 스타트업, 병행)
> - RAG가 "옵션"에서 **"제품의 핵심"**으로 전환됨
>   - 유저가 자기 PDF를 올리면 AI는 그 교재 내용을 모름 → RAG가 유일한 교재 근거
> - 포트폴리오 서사: "독일어 튜터 → 아키텍처 범용화 → 유저 PDF 기반 RAG → 실사용자"
>
> **운영 원칙**
> - 이 파일이 단일 소스. wrap-up Next 섹션은 세션 기록용
> - Phase 완료 또는 방향 전환 시 업데이트

---

## 완료 (v0.1 ~ v0.3)

- [x] Prompt Caching 적용 (fixed_prefix ephemeral) — 2026-03-03
- [x] "Lost in the Middle" 프롬프트 구조 개선 — 2026-03-03
- [x] LLM-as-Judge 평가 시스템 구축 (6규칙, 83→90%) — 2026-03-03
- [x] User Feedback UI (👍/👎) — 2026-03-04
- [x] Monitoring 강화 (token_count, rag_hit 실기록) — 2026-03-04
- [x] 서버 기반 PDF 저장 + ChatPDF 레이아웃 — 2026-03-10
- [x] PDF 주석 (sticky notes, 하이라이트) — 2026-03-11
- [x] PDF별 언어 선택 + TTS 연동 — 2026-03-11

---

## Phase 1: 독일어 전용 코드 제거 — 범용 기반 구축 ✅

> 목표: 독일어 하드코딩 전부 제거. PDF 중심 아키텍처로 전환.
> 완료일: 2026-03-11

### Backend 제거/수정

- [x] **prompts.py 전면 재작성** — 범용 `build_system_prompt(language, learner_language, rag_chunks)`
- [x] **units.py 제거** — 1,000+ lines 삭제
- [x] **schemas.py 수정** — `unit_id/level/textbook_id` → `pdf_id`
- [x] **claude_service.py 수정** — `DOKDOKDOK_A1` 제거, 범용 프롬프트 빌더 호출
- [x] **chat.py 수정** — 대화 키 `(user, pdf_id)`, WORTLISTE 제거, RAG `pdf_id` 필터
- [x] **repositories.py 수정** — `search_vocabulary()` 제거, 전체 repo `unit_id → pdf_id`
- [x] **summaries.py / notes.py 라우터 수정** — `unit_id → pdf_id`
- [x] **test_prompts.py 재작성** — 16/16 pass
- [x] **DB 마이그레이션** — `001_unit_to_pdf.sql` (컬럼 추가 + 데이터 이관 + 구 컬럼 DROP)

### Frontend 제거/수정

- [x] **types.ts** — `UNITS` 배열(56개) 제거, `SavedSummary/SavedNote` → `pdfId/pdfName`
- [x] **chat/page.tsx** — 레벨/단원 선택 제거, PDF 선택 중심
- [x] **ChatPanel.tsx** — Props `pdfId/pdfName`, UNITS lookup 제거
- [x] **useChat.ts** — `level` 타입 제거, `pdf_id` 전달, SUMMARY_PROMPT 범용화
- [x] **summaries.ts / notes.ts** — API 호출 `unit_id → pdf_id`
- [x] **API routes (summaries, notes)** — 프록시 파라미터 `pdf_id`
- [x] **setup/page.tsx 삭제** — obsolete 단원 선택 페이지
- [x] **page.tsx (랜딩)** → `/chat` 리다이렉트로 단순화

### Scripts 정리

- [x] **evaluate.py: 범용 skeleton으로 재작성** — 독일어 규칙(6개) 제거, 범용 규칙(5개)으로 전환, `DOKDOKDOK_A1` import 제거
- [x] **index_pdf.py / index_wortliste.py 삭제** — Phase 2 API 엔드포인트로 대체 예정, 드롭된 DB 컬럼 참조로 깨진 상태
- [x] **test_questions.json: 범용 포맷으로 전환** — `unit_id/level` 제거, `language` 필드 추가

---

## Phase 2: PDF 업로드 → 자동 인덱싱 (RAG 핵심)

> 목표: 유저가 PDF를 업로드하면 자동으로 RAG 인덱싱 완료.
> 이것이 범용 서비스의 핵심 기능.

- [ ] **POST /api/pdfs/{id}/index 엔드포인트**
  - 트리거: PDF 업로드 직후 (또는 수동 호출)
  - 플로우:
    1. Supabase Storage에서 PDF 다운로드
    2. PyMuPDF로 텍스트 추출 (페이지별)
    3. 청킹 (페이지 기반, 또는 문단 기반)
    4. OpenAI embedding batch 호출
    5. `document_chunks` 저장 (pdf_id, page_number, content, embedding)
  - 비동기 처리: FastAPI `BackgroundTasks`
  - 인덱싱 상태: `pdf_files` 테이블에 `index_status` 컬럼 추가
    - `pending` → `indexing` → `ready` → `failed`

- [ ] **인덱싱 상태 UI**
  - PDF 목록에서 인덱싱 상태 표시
  - `ready` 전까지 "AI 질문" 비활성화 또는 경고

- [ ] **RAG 검색 로직 수정**
  - `chat.py`: `pdf_id`로 해당 PDF의 chunks만 검색
  - Vision + RAG 병행 전략:
    - `page_image` 있으면 → RAG는 다른 페이지에서만 검색 (중복 방지)
    - `page_image` 없으면 → RAG 전체 검색

- [ ] **청킹 전략**
  - 기본: 페이지 기반 (1페이지 = 1청크, 간단하고 메타데이터 매핑 쉬움)
  - 긴 페이지: 문단 분할 (token 수 기준)
  - 메타데이터: `{ page_number, pdf_id }`

---

## Phase 3: UX 정리

> 목표: 어떤 언어 교재를 올려도 자연스럽게 동작하는 UX.
> 범용 시스템 프롬프트는 Phase 1에서 완료.

- [x] **범용 시스템 프롬프트 설계** — Phase 1에서 완료
  - `build_system_prompt(language, learner_language, rag_chunks)`
  - Prompt Caching: 고정(역할+규칙) + 동적(RAG) 분리 유지

- [x] **PDF 중심 UX 흐름** — Phase 1에서 완료
  - 단원/레벨 선택 UI 제거, PDF 선택 중심

- [x] **대화 모델** — Phase 1에서 완료
  - 1 PDF = 1 대화 스레드, PDF별 분리

---

## Phase 4: 실사용자 + Eval 재구축

> 목표: 범용 서비스 기반으로 실사용자 확보 + 품질 측정 재구축.

- [ ] **실사용자 확보 (10-20명)**
  - 채널: 언어학습 커뮤니티 (Reddit r/languagelearning, Discord 등)
  - 타겟: 교재 PDF로 외국어 공부하는 사람 (독일어에 한정하지 않음)
  - 온보딩: 소개 게시물 + in-app 피드백

- [ ] **범용 Eval 재설계**
  - 독일어 format 규칙 대신 범용 규칙:
    - `answer_grounded_in_pdf`: RAG 컨텍스트 기반 답변인가?
    - `correct_language`: 학습 대상 언어로 예시를 제공하는가?
    - `answer_completeness`: 질문에 완전히 답했는가?
  - RAG 품질 측정: Context Precision, Context Recall

- [ ] **CI/CD 파이프라인**
  - GitHub Actions: build + lint + deploy
  - Eval CI: 범용 테스트셋으로 품질 회귀 감지

---

## Phase 5: 차별화 (보너스)

- [ ] Hybrid Search (BM25 + vector) — 키워드 vs 의미 검색 결합
- [ ] Observability (비용 대시보드, LangSmith 연동)
- [ ] 임베딩 모델 비교 (multilingual-e5-large vs text-embedding-3-small)
- [ ] 다국어 TTS 자동 감지 (PDF 언어 → TTS 언어 자동 설정)

---

## 적용 제외 (명시적 결정)

| 기법 | 이유 |
|------|------|
| Agents / ReAct | PDF Q&A에 불필요한 복잡도. 단발성 응답 적합 |
| Semantic Caching | 질문 다양성 높아 히트율 낮음. Prompt Caching으로 충분 |
| Model Router | 품질 일관성 > 비용 절감 |
| Pinecone / Weaviate | 유저당 수백 청크 수준. pgvector + SQL 필터로 충분 |
| Finetuning | 유저별 교재가 다르므로 범용 모델이 적합 |

---

## 우선순위 요약

```
Phase 1: 독일어 제거 + PDF 중심 전환     ← 범용화 기반. 이것 없이는 나머지 불가
Phase 2: PDF 업로드 → 자동 인덱싱        ← RAG 핵심. 제품의 존재 이유
Phase 3: 범용 프롬프트 + UX              ← 어떤 언어든 동작하는 상태
Phase 4: 실사용자 + Eval                 ← 포트폴리오 증거
Phase 5: 차별화                          ← 보너스
```

---

## 피벗으로 달라지는 포트폴리오 스토리

```
기존:
  "독일어 RAG 튜터 → Eval 설계 → 83→90%"

변경:
  "독일어 튜터 → 아키텍처가 특정 언어에 종속됨을 인식
   → 유저 PDF 기반 범용 서비스로 피벗
   → RAG가 '옵션'에서 '핵심'으로 전환
   → Hybrid Search로 검색 품질 X% 달성
   → 실사용자 N명, 피드백 기반 개선"

증명하는 역량:
  - 제품 판단력: 시장 확장을 위한 아키텍처 피벗
  - RAG 운영: 유저별 동적 인덱싱 + 검색
  - E2E 소유: 혼자 기획→피벗→배포→사용자 확보
```
