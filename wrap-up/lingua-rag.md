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
| 대화 히스토리 UI | **TODO** | 이전 대화 목록 + 이어서 질문 |
| 단원 선택 UI | **TODO** | 현재 A1-1 고정 → wireframe-spec.md Screen 2 참조 |
| 레벨 범위 이탈 처리 (FR-5) | Done | 프롬프트 기반 거절 |
| 세션 쿠키 유저 식별 (FR-6) | Done | httponly cookie |
| TTS 독일어 발음 | Done | Web Speech API `de-DE`, 볼륨 조절 |
| Render cold start 대응 | **TODO** | 프론트엔드 로딩 상태 표시 |
| 배포 (Render + Vercel) | Done | 백엔드 + DB: Render, 프론트: Vercel |
| 테스트 (pytest) | **TODO** | f1-spec Section 9 시나리오 + acceptance criteria |

### v0.2 — RAG + PDF 벡터 검색 (미착수)

- [ ] 임베딩 모델 선택 (ADR-003 결정)
- [ ] PDF 파싱 + 청킹 파이프라인
- [ ] pgvector 확장 + 벡터 검색 엔드포인트
- [ ] STT/TTS 고도화 (외부 API 검토)
- [ ] DB: Render PostgreSQL → Supabase 이전 (pgvector + 90일 제한 해소)
- [ ] 학습 리마인더 알림 검토 ← user-journey-map.md

### v0.3 — 품질 + 인증 (미착수)

- [ ] LLM-as-judge 포맷 검증
- [ ] 사용자 인증/Auth (Supabase Auth)

### Open Questions

| # | 질문 | 상태 | 출처 |
|---|------|------|------|
| OQ-1 | 세션 쿠키 만료 기간? (7일? 30일?) | 미결정 | f1-spec |
| OQ-2 | Render PostgreSQL 90일 후 전략 | Supabase 이전 예정 (ADR-004) | decisions.md |
| OQ-3 | 56개 단원 요약 ~1,200 token 비용 허용 여부 | 확인 필요 (~$0.02/질문 OK) | f1-spec |
| OQ-4 | max_tokens 1,024 → 긴 문법 설명 잘림 여부 | 테스트 필요 | f1-spec |
| OQ-5 | 독독독 저작권 확인 | 미확인 | — |
| OQ-6 | 다중 기기 시나리오 (세션 쿠키 한계) | 미검토 | — |

### UX 미결정 사항

| 항목 | 상태 | 출처 |
|------|------|------|
| 완료 단원 처리 방식 (버튼 vs 자동) | 미결정 | wireframe-spec.md |
| 모바일 드로어 자동 닫힘 여부 | 미결정 | wireframe-spec.md |
| 답변 복사 버튼 필요 여부 | 미결정 | wireframe-spec.md |
| 학습 진행률 표시 UX 상세 설계 | 미착수 | user-journey-map.md |

### 비즈니스/GTM (시기 미정)

| 항목 | 상태 | 출처 |
|------|------|------|
| TAM: 독일어 학습 시장 규모 조사 | 미착수 | prd.md |
| GTM: 콘텐츠 마케팅 채널·전략 수립 | 미착수 | prd.md |
| Pricing: 가격 모델 검토 | 미착수 | prd.md |

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
