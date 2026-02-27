# LinguaRAG - Wrap Up

> **Project**: `/Users/jaykim/Documents/Projects/lingua-rag`
> **Scope**: Full stack (backend + frontend + infra)
> **Live**: https://lingua-rag.vercel.app

---

## Session: 2026-02-27 20:14

> **Context**: RAG 인덱싱 품질 개선 — 단원 감지 정확도 100%, 부록 제거, 단원명 교정 후 배포

### Done
- fix(rag): `index_pdf.py` 한국어 단원 헤더 패턴 재작성
  - Format A: `r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]{10,}\S"` (10+ spaces)
  - Format B: `r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]*\n[ \t]{15,}[\uAC00-\uD7A3]"` (15+ spaces + Korean)
- fix(rag): `LESSON_START_PAGE=10` — TOC/표지 페이지(1-9) 단원 감지 스킵
- fix(rag): `LESSON_END_PAGE=178` — 부록/정답지 페이지(178+) 청킹 제외
- fix(rag): `MAX_UNIT_STEP=5` — 페이지 번호 오탐 방지 (단조 증가 스텝 가드)
- fix(rag): 저작권 watermark 줄 사전 제거 (`SKIP_IF_CONTAINS` 라인 레벨 필터링)
  - 추가된 항목: "License Number", "Zusammen A1", "독독독 독일어"
- feat(data): `units.py` + `types.ts` — 56단원 제목/밴드명 실제 교재 기준으로 전면 교체
- fix(db): `connection.py` — pool `timeout` 20s→60s, `max_inactive_connection_lifetime=300` 추가
- chore(rag): 재인덱싱 실행 (--clear) → 244개→**186개** (부록 58청크 제거, A1-1~A1-56 전부 유지)
- chore(deploy): `git push main` → Render + Vercel 자동 배포 트리거

### Decisions
- **LESSON_END_PAGE=178**: 독독독 A1 부록은 페이지 178부터 시작. 마지막 단원(A1-56)에 40개 노이즈 청크가 인덱싱되던 문제 해소
- **Format B `[\uAC00-\uD7A3]` 요구**: Latin 문자로 시작하는 페이지 푸터("Zusammen A1")가 오탐되는 것을 한국어 문자 요구로 차단
- **MAX_UNIT_STEP=5**: 홀수 페이지 번호(11, 13, 15...)가 동일 번호 단원으로 오탐되는 패턴을 "이전 단원+5 이내" 조건으로 완전 제거. 정상 단원은 항상 +1 이동이므로 false negative 없음

### Issues
- **RAG 동작 확인 착오**: 사용자가 "PDF를 봐줄 수 있나요?" 메타 질문으로 테스트 → Claude가 "PDF 열람 불가" 응답. 실제로는 독일어 내용 질문("Das ist ein Nudelgericht. 는 true인가요?")으로 테스트 시 RAG 정상 동작 확인됨. OPENAI_API_KEY는 이미 Render에 설정되어 있었음

### Next
- [ ] v0.3 착수 계획 수립 (LLM-as-judge 포맷 검증)
- [ ] 진행률 표시 UX 설계 (완료 단원 처리 방식)
- [ ] STT 기능 검토 (외부 API vs Web Speech API)

---

## Progress

### v0.1 — Claude Streaming Q&A

| Feature | Status | Note |
|---------|--------|------|
| FastAPI + SSE Streaming (FR-1) | Done | `POST /api/chat`, uvicorn + uvloop |
| 시스템 프롬프트 동적 조합 (FR-2) | Done | 레벨 + 단원 컨텍스트 빌드 |
| 답변 포맷 일관성 (FR-3) | Done | 프롬프트 기반 (LLM-as-judge는 v0.3) |
| 대화 히스토리 DB 저장 (FR-4) | Done | 최근 10개 메시지 컨텍스트 |
| 대화 히스토리 UI | Done | 단원 전환 시 DB 히스토리 로드 |
| 단원 선택 UI | Done | 사이드바 56단원 + 레벨 선택 온보딩 |
| 레벨 범위 이탈 처리 (FR-5) | Done | 프롬프트 기반 거절 |
| 세션 쿠키 유저 식별 (FR-6) | Done | httponly cookie (lingua_session, 30일) |
| TTS 독일어 발음 | Done | Web Speech API `de-DE`, 볼륨 조절 |
| Render cold start 대응 | Done | 워밍업 배너 + useBackendHealth hook |
| 배포 (Render + Vercel) | Done | 백엔드 + DB: Render, 프론트: Vercel |
| max_tokens 잘림 (OQ-4) | Done | 1024 → 2048 상향, truncation 안내 개선 |
| 테스트 (pytest) | Done | f1-spec Section 9 시나리오 29/29 통과 |

### v0.2 — RAG + PDF 벡터 검색 (완료)

- [x] 임베딩 모델 선택 — text-embedding-3-small (ADR-003)
- [x] PDF 파싱 + 청킹 파이프라인 — pdftotext + chunk_text, 250 chunks
- [x] pgvector 확장 + 벡터 검색 — VectorSearchRepository, cosine distance
- [x] RAG → Claude system prompt 주입 — top-3 chunks 실시간 삽입
- [x] 프로덕션 검증 — Render 로그 "RAG: found 3 chunks for unit A1-1" 확인
- [ ] STT/TTS 고도화 (외부 API 검토)
- [x] DB: Render PostgreSQL → Supabase 이전 (pgvector + 90일 제한 해소)
- [ ] 학습 리마인더 알림 검토 ← user-journey-map.md

### v0.3 — 품질 + 인증 (미착수)

- [ ] LLM-as-judge 포맷 검증
- [x] 사용자 인증/Auth (Supabase Auth) — Google OAuth + JWT ES256 완료

### Open Questions

| # | 질문 | 상태 | 출처 |
|---|------|------|------|
| OQ-1 | 세션 쿠키 만료 기간? (7일? 30일?) | **해소** — JWT 기반으로 전환, 쿠키 세션 폐기 | f1-spec |
| OQ-2 | Render PostgreSQL 90일 후 전략 | **해소** — Supabase 이전 완료 | decisions.md |
| OQ-3 | 56개 단원 요약 ~1,200 token 비용 허용 여부 | 확인 필요 (~$0.02/질문 OK) | f1-spec |
| OQ-4 | max_tokens 1,024 → 긴 문법 설명 잘림 여부 | 테스트 필요 | f1-spec |
| OQ-5 | 독독독 저작권 확인 | 미확인 | — |
| OQ-6 | 다중 기기 시나리오 (세션 쿠키 한계) | **해소** — user_id 기반 히스토리로 전환, 동일 Google 계정으로 다기기 공유 가능 | — |

### UX 미결정 사항

| 항목 | 상태 | 출처 |
|------|------|------|
| 완료 단원 처리 방식 (버튼 vs 자동) | 미결정 | wireframe-spec.md |
| 모바일 드로어 자동 닫힘 여부 | 미결정 | wireframe-spec.md |
| 답변 복사 버튼 | Done | 호버 시 copy 아이콘, 1.5s "복사됨" 피드백 |
| 학습 진행률 표시 UX 상세 설계 | 미착수 | user-journey-map.md |

### 비즈니스/GTM (시기 미정)

| 항목 | 상태 | 출처 |
|------|------|------|
| TAM: 독일어 학습 시장 규모 조사 | 미착수 | prd.md |
| GTM: 콘텐츠 마케팅 채널·전략 수립 | 미착수 | prd.md |
| Pricing: 가격 모델 검토 | 미착수 | prd.md |

---

## Session: 2026-02-27 18:56

> **Context**: v0.2 RAG 완성 — PDF 인덱싱 + pgvector 검색 + Render 프로덕션 검증

### Done
- feat(rag): `scripts/index_pdf.py` — pdftotext(subprocess) 기반 PDF 추출, 204페이지 → 250 chunks 생성
- fix(rag): `chunk_text()` 무한 루프 버그 2개 수정
  - 버그1: 경계 탐색 search window가 start보다 앞으로 갈 때 end = start+1 → start 역주행. `search_begin > start` 조건 추가로 수정
  - 버그2: end >= length 시 start = end - overlap 고정 → 무한루프. `if end >= length: break` 추가
- feat(rag): OpenAI text-embedding-3-small로 250 chunks 임베딩 생성 후 Supabase document_chunks 삽입 완료
- fix(rag): `VectorSearchRepository.max_distance` 0.5 → 0.7 (현재 chunk 품질 기준 실용적 임계값)
- fix(deploy): `requirements.txt`에서 `pdfplumber` 제거 (로컬 전용 스크립트, Render 불필요)
- fix(deploy): `connection.py` — asyncpg pool `min_size` 2 → 1, `timeout=20.0` 추가 (Render cold start SSL timeout 해소)
- chore(rag): RAG hit 로그 DEBUG → INFO 승격 (Render 로그에서 가시화)
- chore(rag): ivfflat 인덱스 생략 — 250 rows에서 sequential scan이 더 빠름. maintenance_work_mem 부족 에러도 회피

### Decisions
- **pdftotext (CLI) 채택**: pdfplumber/pypdf 모두 chunk_text 버그로 50GB 메모리 소모. pdftotext는 페이지별 subprocess 호출로 Python 힙 최소화
- **max_distance 0.7**: 현재 chunk들이 저작권 문구 오염으로 실질 거리가 0.61–0.63. 0.5로는 항상 0결과 → 0.7로 상향
- **ivfflat 인덱스 불필요**: 250 rows에서 pgvector sequential scan이 인덱스보다 빠름. 10K+ rows 이후 재검토
- **pdfplumber 서버 제외**: index_pdf.py는 로컬 일회성 스크립트. Render Docker에 pdfminer/pypdfium2 대용량 바이너리 불필요

### Issues
- **50GB 메모리 / exit 137**: chunk_text 무한루프가 원인. pdfplumber→pypdf→pdftotext 전환은 무관했음
- **Render 배포 실패 (SSL TimeoutError)**: pdfplumber 의존성 제거 + min_size/timeout 조정으로 해소
- **ivfflat 인덱스 생성 실패**: `memory required is 59MB, maintenance_work_mem is 32MB` — Supabase free tier 제한. 인덱스 없이 운영 결정

### Next
- [ ] chunk 품질 개선: 각 페이지 저작권 문구(`*본 책은 저작권법에 의해...`)가 모든 chunk 앞에 붙어 노이즈. 추출 시 필터링 필요
- [ ] 단원 감지 검증: `Einheit/Lektion/Kapitel N` 패턴으로 감지된 A1-1, A1-8, A1-15... 가 실제 교재 단원과 일치하는지 확인
- [ ] v0.3 착수 계획 수립 (LLM-as-judge 포맷 검증, 인증 개선)

---

## Session: 2026-02-27 16:04

> **Context**: Google OAuth 로그인 구현 (Supabase Auth), JWT ES256 검증, 사이드바 유저 카드 UI, Vercel 배포 완료

### Done
- feat(auth): Google OAuth 로그인 구현 — Supabase Auth + `@supabase/ssr`, middleware 라우트 보호
- feat(auth): `deps/auth.py` — PyJWT JWKS 클라이언트로 ES256 토큰 검증 (`cryptography` + `certifi`)
- feat(db): `sessions` 테이블 삭제, `conversations.user_id` (auth.users.id) 로 교체
- feat(backend): `get_current_user` Depends — `HTTPBearer` + JWKS 기반 UUID 추출
- feat(frontend): `lib/supabase/{client,server}.ts`, `middleware.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts` 신규
- feat(frontend): API proxy 3개 — `lingua_session` 쿠키 → `Authorization: Bearer` 헤더로 전환
- feat(frontend): 사이드바 하단 유저 카드 — 이니셜 아바타 + 이름 표시, 클릭 시 팝오버 (이메일 + 로그아웃)
- fix(auth): Supabase 신규 프로젝트 JWT 알고리즘 HS256 → ES256 — JWKS endpoint + `PyJWKClient` 전환
- fix(auth): macOS Python 3.13 SSL 인증서 미포함 — `certifi` CA bundle을 JWKS 클라이언트에 명시 주입
- fix(deploy): `middleware.ts` Next.js 15 타입 오류 — `request.cookies.set(name, value, options)` → `(name, value)`
- fix(deploy): `frontend/app/setup/page.tsx` 최초 커밋 누락 → 404 해소
- chore(deps): `requirements.txt` — `cryptography>=43.0.0`, `certifi>=2024.0.0` 추가

### Decisions
- **Supabase Auth 선택**: 이미 Supabase DB 사용 중 → 추가 서비스 없이 동일 플랫폼에서 Google OAuth 제공
- **JWKS/ES256**: Supabase 신규 프로젝트는 HS256 대신 ES256 사용. 환경변수 `SUPABASE_JWT_SECRET` 제거, `SUPABASE_URL`로 JWKS 엔드포인트 구성
- **certifi 명시 주입**: macOS Python.org 인스톨러는 시스템 keychain 미사용 → `urllib` HTTPS 실패. `certifi.where()`로 CA bundle 명시. Render(Linux)에서는 불필요하나 동일 코드로 동작
- **세션 쿠키 완전 제거**: `lingua_session` httponly 쿠키 → Supabase JWT Bearer 토큰. OQ-1(만료 기간), OQ-6(다기기) 모두 해소

### Issues
- **JWT alg 불일치 (401)**: `deps/auth.py`가 HS256으로 디코드 → Supabase ES256 토큰 검증 실패. 토큰 헤더 디코딩으로 원인 확인 후 JWKS 방식으로 교체
- **SSL CERTIFICATE_VERIFY_FAILED**: macOS Python 3.13 venv에서 JWKS URL fetch 실패. `certifi` 미설치 확인 후 `.venv/bin/pip install certifi`로 해결
- **Vercel 빌드 실패 1**: `middleware.ts` TypeScript 오류 — `RequestCookies.set()`은 Next.js 15에서 options 3번째 인자 불허
- **Vercel 빌드 실패 2**: `frontend/app/setup/page.tsx` 미추적 파일로 커밋 누락 → `/setup?level=A1` 404

### Next
- [x] 프로덕션 E2E 검증 — Render 백엔드 재배포 확인, Google 로그인 → 채팅 → 히스토리 공유 (다기기)
- [x] v0.2 RAG 착수 — 임베딩 모델 선택 (ADR-003), PDF 파싱 파이프라인, pgvector 벡터 검색

---

## Session: 2026-02-26 20:17

> **Context**: 로컬 환경 세팅부터 Render/Vercel 배포까지 전체 파이프라인 구축 완료

### Done
- feat(backend): pydantic-settings `DATABASE_URL` 버그 수정 (`os.environ` → `settings.DATABASE_URL`)
- feat(frontend): Web Speech API 기반 독일어 TTS 구현 (bold 텍스트 클릭 → 발음 재생, 볼륨 슬라이더)
- chore: `.gitignore` 생성 (`.env`, `node_modules`, `__pycache__`, `.next`)
- chore: 로컬 환경 구축 (PostgreSQL@17, Python venv, npm install, `.env` 파일 생성)
- chore(deploy): Render 백엔드 배포 (Docker, Singapore region, free tier)
- chore(deploy): Render PostgreSQL 생성 + schema.sql 초기화
- chore(deploy): Vercel 프론트엔드 배포 (Next.js, `BACKEND_URL` 연결)
- fix(security): Next.js 15.1.4 → 15.5.12 업데이트 (CVE-2025-66478, Vercel 배포 차단 해결)
- docs: Railway → Render 변경 반영 (README, Dockerfile 주석, ADR-004)
- docs: 기획 문서 통합 (prd, user-journey-map, wireframe-spec → docs/)
- docs: TODO 일원화 (각 문서 TODO → wrap-up Progress 섹션으로 통합)

### Decisions
- **Railway → Render**: Railway 무료 티어 폐지로 Render free tier 선택 (cold start ~50초, DB 90일 제한 트레이드오프)
- **TTS: Web Speech API**: 외부 API 없이 브라우저 내장 `speechSynthesis` 사용 (`de-DE`, rate 0.85)
- **Next.js API Route 프록시**: 브라우저 → Vercel `/api/chat` → Render 백엔드 구조 (CORS 단순화, 쿠키 전달)
- **문서 일원화**: wrap-up/lingua-rag.md를 단일 진행 추적 문서로 사용. docs/는 설계 레퍼런스만 보관

### Issues
- Render Web Service 이름 충돌: `linguarag-backend` 이미 사용 중 → 결국 같은 이름으로 생성 성공
- Render 첫 배포 실패: `messages` 테이블 미존재 에러 → 재배포 후 정상 동작
- Anthropic API 크레딧 부족: Claude Max 플랜과 별개로 API 크레딧 $5 별도 구매 필요

---

## Session: 2026-02-27

> **Context**: 대화 히스토리 UI + Render cold start 대응 구현

### Done
- feat(backend): `list_by_session` 쿼리에 `message_count` LEFT JOIN 추가
- feat(frontend): `/api/conversations`, `/api/conversations/[id]/messages`, `/api/health` proxy routes 추가
- feat(frontend): `useChat` — 단원 전환 시 DB 히스토리 자동 로드 (`isLoadingHistory` 상태 추가)
- feat(frontend): `useBackendHealth` hook — 백엔드 워밍업 감지 (3s 폴링, 최대 20회)
- feat(frontend): 사이드바 Q&A badge — 단원별 대화 수 표시 (message_count / 2 반올림)
- feat(frontend): Cold start 배너 — "서버가 시작 중입니다" 상단 amber 배너
- feat(frontend): ChatPanel 히스토리 로딩 스피너

### Decisions
- **히스토리 로드 전략**: 단원 전환 시 `GET /api/conversations` → unit_id 필터링 → 최신 conversation의 messages 로드. 백엔드 추가 엔드포인트 없이 기존 API 재활용.
- **Q&A badge 계산**: `Math.ceil(message_count / 2)` — user+assistant 쌍으로 환산
- **cold start 배너**: `checking` → 처음 응답 없으면 `warming` 상태로 전환. 성공 시 즉시 숨김

---

## Session: 2026-02-27 (3차)

> **Context**: Supabase 이전 (Render PostgreSQL → Supabase, OQ-2 해소)

### Done
- chore(db): Render PostgreSQL → Supabase (PostgreSQL 17.6, Singapore) 이전 완료
- feat(db): `schema.sql` — `CREATE EXTENSION IF NOT EXISTS vector` 추가 (v0.2 RAG 준비)
- fix(backend): `connection.py` — `sslmode=require` DSN 파싱 + asyncpg `ssl='require'` 자동 설정
- fix(deploy): Render 배포 실패 (`OSError: [Errno 101] Network is unreachable`) → Session Mode Pooler URL로 해결

### Decisions
- **Session Mode Pooler (5432)**: Supabase direct connection(`db.xxx.supabase.co`)은 IPv6 전용 — Render free tier 및 macOS 로컬 모두 IPv4만 지원. Session Mode Pooler(`pooler.supabase.com:5432`)로 통일
- **asyncpg + Session Pooler 호환성**: Transaction Pooler(6543)는 named prepared statements 비호환 → Session Pooler(5432) 선택 필수
- **sslmode 처리 방식**: asyncpg는 DSN의 `sslmode` 파라미터를 무시 → URL에서 strip 후 `ssl='require'` kwarg로 전달

### Issues
- Supabase direct connection URL (`db.xxx.supabase.co`) IPv6 only — Render + macOS 모두 실패
- 해결: Supabase 대시보드 "Not IPv4 compatible → Use Session Pooler" 버튼으로 Pooler URL 취득

---

## Session: 2026-02-27 (2차)

> **Context**: UX 안정화 + 스트림 지속성 개선

### Done
- fix(frontend): 세션 쿠키 이름 `session_id` → `lingua_session` 통일 (chat/conversations/messages proxy 3곳)
- feat(frontend): 온보딩 라우팅 재구성 (`/` 레벨 선택 → `/setup` → `/chat?unit=&level=`)
- feat(frontend): 재방문 유저 localStorage 기반 `/chat` 자동 리다이렉트
- feat(frontend): `useChat` generationRef — 단원 전환 시 스트림 orphan 처리 (abort 없이 drain → DB 저장 보장)
- feat(frontend): Persistent ChatPanel (`display:none`) — 단원 전환 시 스트림/상태 유지, 복귀 시 실시간 스트리밍 이어서 표시
- feat(frontend): 사이드바 drag-to-resize (160px~480px, mousedown/move/up, 드래그 중 select-none)
- fix(frontend): 사이드바 Q&A badge 제거
- fix(backend): `MAX_TOKENS` 1024 → 2048 (Band 5~6 문법 설명 잘림 방지, OQ-4 해소)
- fix(frontend): truncation 안내 문구 개선 ("더 짧게 질문" → "더 구체적으로 나눠서 질문")
- feat(frontend): 답변 복사 버튼 — 호버 시 copy 아이콘, 1.5초 "복사됨" 피드백 (user/assistant 메시지 모두)

### Decisions
- **Persistent Panel 전략**: useChat 레벨 stream registry보다 `display:none` 방식이 단순하고 효과적. React state + 진행 중 fetch 모두 보존됨.
- **generationRef**: display:none으로 primary 해결되나, useChat 자체의 orphan drain 로직을 safety net으로 유지
- **max_tokens 2048**: claude-sonnet-4-6 기준 문법 총정리 단원도 충분. 잘림 시 사용자에게 올바른 안내 제공
