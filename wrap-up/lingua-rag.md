# LinguaRAG - Wrap Up

> **Project**: `/Users/jaykim/Documents/Projects/lingua-rag`
> **Scope**: Full stack (backend + frontend + infra)
> **Live**: https://lingua-rag.vercel.app

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

### v0.2 — RAG + PDF 벡터 검색 (미착수)

- [ ] 임베딩 모델 선택 (ADR-003 결정)
- [ ] PDF 파싱 + 청킹 파이프라인
- [ ] pgvector 확장 + 벡터 검색 엔드포인트
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
- [ ] 프로덕션 E2E 검증 — Render 백엔드 재배포 확인, Google 로그인 → 채팅 → 히스토리 공유 (다기기)
- [ ] v0.2 RAG 착수 — 임베딩 모델 선택 (ADR-003), PDF 파싱 파이프라인, pgvector 벡터 검색

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
