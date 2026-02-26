# LinguaRAG - Architecture Decision Records (ADR)

> 주요 기술 결정과 그 이유를 기록한다.
> 나중에 "왜 이걸 썼지?" 를 방지하기 위함.

---

## ADR-001: PostgreSQL + pgvector (전용 벡터 DB 대신)

**날짜**: 2026-02-25
**상태**: 채택

**결정**: Pinecone/Weaviate 같은 전용 벡터 DB 서비스 대신 PostgreSQL에 pgvector 확장 사용

**이유**:
- v0.1에서 이미 PostgreSQL 사용 (conversations 테이블) → 인프라 단순화
- Fly.io 무료 티어에서 별도 서비스 없이 운영 가능
- `WHERE unit_id = 'A1-13'` 같은 메타데이터 필터를 SQL로 처리 가능
- 포트폴리오 단계에서 외부 의존성 최소화

**트레이드오프**:
- 수백만 벡터 규모에서는 전용 벡터 DB보다 성능 낮음
- v0.1 교재 1권(A1) 기준으로는 충분 (예상 청크 수: ~1,000개)

---

## ADR-002: FastAPI (Django/Flask 대신)

**날짜**: 2026-02-25
**상태**: 채택

**결정**: Python 백엔드로 FastAPI 선택

**이유**:
- SSE (Server-Sent Events) 스트리밍 지원이 자연스러움
- async/await 네이티브 → Claude API 스트리밍과 궁합
- AI PE JD 요건 (Python 백엔드)
- 자동 OpenAPI 문서 생성

---

## ADR-003: 임베딩 모델 선택 (v0.2 결정 대기)

**날짜**: 2026-02-25
**상태**: 보류 (v0.2 시작 전 결정)

**배경**: v0.1에는 RAG 없음 → 임베딩 불필요. v0.2 PDF 연동 시점에 결정.

**후보 옵션**:

| 옵션 | 비용 | 독일어 품질 | 비고 |
|------|------|-----------|------|
| OpenAI text-embedding-3-small | $0.02/1M | 양호 (영어 중심) | 가장 익숙, 문서 풍부 |
| Voyage AI voyage-multilingual-2 | $0.06/1M | 우수 (다국어 특화) | Anthropic 투자, Claude와 궁합 |
| Cohere embed-multilingual-v3.0 | $0.10/1M | 우수 (100개 언어) | 독일어 특화 강점 |
| HuggingFace multilingual-e5-large | 무료 | 우수 | 무료 추론 API, 속도/안정성 제한 |

**결정 기준 (v0.2에서 A/B 테스트)**:
- 독일어 독독독 A1 청크로 실제 검색 품질 비교
- A1 전체 (~1,000 청크) 임베딩 비용은 어느 옵션이든 수 센트 수준 → 품질 우선
- 운영 복잡도 최소화 (외부 API 선호, 로컬 모델은 후순위)

**잠정 방향**: Voyage AI voyage-multilingual-2 또는 OpenAI text-embedding-3-small 중 v0.2 테스트 결과로 최종 결정.

---

## ADR-004: 배포 플랫폼 (Vercel + Render)

**날짜**: 2026-02-25
**상태**: 채택 (Railway → Render 변경: 2026-02-26)

**결정**: Next.js → Vercel, FastAPI + PostgreSQL → Render

**이유**:
- Next.js는 Vercel 네이티브 최적화 (Jay 기존 강점 활용)
- Render: 완전 무료 티어 제공 (신용카드 불필요)
- PostgreSQL Render 내장 → 별도 DB 서비스 불필요 (v0.1 기준)
- Dockerfile 기반 배포 → GitHub 연동 자동 배포

**변경 이유 (Railway → Render)**:
- Railway: 30일 무료 후 월 $1 + 사용량 과금
- Render: 완전 무료 (PostgreSQL 90일 제한, 재생성 가능)
- v0.1 포트폴리오/베타 테스트 목적으로는 Render가 적합

**트레이드오프**:
- 두 서비스 관리 → CORS 설정 필요 (FastAPI ↔ Next.js)
- Render 무료 티어 cold start ~30초 (15분 비활성 시 슬립)
- PostgreSQL 90일 후 만료 → 재생성 또는 Supabase 이전 필요

**v0.2 전환 계획**:
- DB만 Render PostgreSQL → Supabase로 이전 (pgvector 공식 지원 + v0.3 Auth 무료 포함)
- FastAPI, Next.js 배포는 그대로 유지

---

<!-- 개발 진행하면서 결정 사항 추가 -->
