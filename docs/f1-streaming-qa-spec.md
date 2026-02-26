# F1: Claude Streaming Q&A — Technical Specification

> **Generated**: 2026-02-25
> **Status**: Draft v1.0
> **Scope**: LinguaRAG v0.1
> **Related**: [Product Brief](../product-brief-lingua-rag-v01-20260225.md)

---

## 1. Overview

### Purpose

독독독 A1 단원 컨텍스트를 자동으로 주입하여 Claude claude-sonnet-4-6이 레벨/교재/단원에 맞는 독일어 답변을 Streaming으로 반환하는 핵심 기능.

### Scope

**In Scope (v0.1):**
- SSE 기반 Claude Streaming Q&A
- 시스템 프롬프트 동적 조합 (레벨 + 단원 컨텍스트)
- 대화 히스토리 유지 (세션 쿠키 기반 유저 식별)
- 에러 처리 + 자동 재시도
- 메시지 큐잉 (Streaming 중 새 메시지)

**Out of Scope (v0.2+):**
- RAG 기반 PDF 벡터 검색 (v0.2)
- LLM-as-judge 포맷 검증 (v0.3)
- STT/TTS 통합 (v0.2)
- 사용자 인증/Auth (v0.3)

---

## 2. Functional Requirements

### FR-1: SSE Streaming 응답

- **Description**: 사용자 메시지 전송 시 Claude API를 SSE(Server-Sent Events)로 호출하고 토큰 단위로 프론트엔드에 스트리밍
- **Priority**: Must
- **Acceptance Criteria**:
  - [ ] 첫 토큰 도착: 전송 후 **< 2초**
  - [ ] 전체 응답 완료: 일반 질문 기준 **< 10초**
  - [ ] SSE 연결 유지: 응답 완료 시 `data: [DONE]` 이벤트 전송
  - [ ] 프론트엔드에서 토큰 단위로 텍스트가 점진적으로 렌더링됨

### FR-2: 시스템 프롬프트 동적 조합

- **Description**: 레벨(A1/A2) + 현재 선택된 단원의 컨텍스트를 조합하여 요청마다 시스템 프롬프트 생성
- **Priority**: Must
- **System Prompt 구성**:

```
[1] 튜터 역할 선언 (고정)
[2] 레벨별 수식자 (LEVEL_CONFIG[level])
[3] 전체 56개 단원 요약표 (고정, ~1,200 token)
[4] 현재 단원 상세 (unit topics + context_prompt)
[5] 답변 포맷 규칙 (고정)
[6] 제약사항 (레벨 범위 이탈 처리)
```

- **Acceptance Criteria**:
  - [ ] A1 선택 시 → A1 레벨 제약 적용된 프롬프트 생성
  - [ ] A1-13 선택 시 → "약속하기" 단원 topics + context_prompt 포함
  - [ ] 단원 변경 시 → 다음 요청부터 새 단원 프롬프트 적용

### FR-3: 답변 포맷 일관성

- **Description**: 모든 답변에 `예문 + 번역 + 문법` 3요소 포함
- **Priority**: Must
- **v0.1 전략**: 프롬프트 강화로 해결 (LLM-as-judge는 v0.3)
- **포맷 규칙**:

```
[한국어 개념 설명]

예문: **[핵심단어]** 포함 독일어 문장
번역: 한국어 번역
문법: 해당 문법 포인트 한 줄

💡 팁: 추가 학습 포인트
```

- **Acceptance Criteria**:
  - [ ] 문법 질문 10개 연속 테스트 시 90% 이상 포맷 준수
  - [ ] 핵심 독일어 단어는 `**볼드**` 처리

### FR-4: 대화 히스토리 유지

- **Description**: 세션 쿠키 기반 유저 식별. 최근 10개 메시지를 컨텍스트로 포함
- **Priority**: Must
- **히스토리 처리 규칙**:
  - PostgreSQL `messages` 테이블 저장 (role: `user` | `assistant`)
  - API 호출 시 최근 10개 메시지만 포함 (10개 초과 시 **조용히 자름**, 유저에게 알리지 않음)
  - 단원 변경 시 → 새 `conversation_id` 생성 (이전 대화와 분리)
- **Acceptance Criteria**:
  - [ ] 세션 재방문 시 이전 대화 유지 (세션 쿠키 유효 기간 내)
  - [ ] 단원 A → 단원 B 전환 시 대화 컨텍스트 분리됨
  - [ ] 11번째 이전 메시지는 프롬프트에 포함되지 않음 (DB에는 보존)

### FR-5: 레벨 범위 이탈 질문 처리

- **Description**: A1/A2 범위를 벗어난 질문 (B2 문법, 영어 번역 요청 등) 처리
- **Priority**: Must
- **동작**: 거절 후 안내

```
거절 메시지 예시:
"죄송합니다. 현재 A1 레벨 모드에서는 A1 범위의 질문만 답변드릴 수 있어요.
B2 문법은 A2 → B1 → B2 순으로 학습하시는 것을 권장합니다.
A1 범위에서 도움이 필요하시면 언제든지 질문해주세요! 🙂"
```

- **Acceptance Criteria**:
  - [ ] 레벨 범위 이탈 감지 시 거절 메시지 반환 (Streaming 아닌 일반 응답)
  - [ ] 거절 메시지에 현재 레벨 안내 포함

### FR-6: 유저 식별 (Auth 없음)

- **Description**: v0.1 Auth 없이 서버 세션 쿠키로 유저 구분
- **Priority**: Must
- **동작**:

```
첫 방문 → 서버가 session_id 생성 → Set-Cookie 헤더
재방문 → Cookie의 session_id로 conversations 조회
다른 브라우저/기기 → 별도 session_id → 히스토리 없음
```

- **Acceptance Criteria**:
  - [ ] 브라우저 재시작 후 재방문 시 이전 대화 유지
  - [ ] 시크릿 모드 방문 시 새 세션 시작 (별도 히스토리)

---

## 3. Non-Functional Requirements

### NFR-1: 성능

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 첫 토큰 지연 | < 2초 | `performance.now()` 클라이언트 측정 |
| 전체 응답 시간 | < 10초 (일반 질문) | 클라이언트 측정 |
| SSE 연결 수립 | < 500ms | 네트워크 탭 |

### NFR-2: 비용

| 항목 | 예상 비용 | 기준 |
|------|----------|------|
| 시스템 프롬프트 | ~1,400 token/요청 | 고정 부분 + 단원 상세 |
| 대화 히스토리 | ~2,000 token/요청 (평균) | 최근 10개 메시지 |
| 답변 | ~300-500 token/응답 | 포맷 기준 |
| **총 비용** | **~$0.02-0.04/질문** | claude-sonnet-4-6 기준 |

### NFR-3: 신뢰성

- Render 배포 기준 99% uptime 목표 (단일 서버, 무료 티어 한계 인정)

---

## 4. Technical Design

### 4.1 아키텍처

```
[Next.js 15 클라이언트]
    ↓ POST /api/chat (fetch + ReadableStream)
[FastAPI 서버]
    ↓ 세션 쿠키 검증
    ↓ 시스템 프롬프트 빌드
    ↓ DB에서 히스토리 조회 (최근 10개)
    ↓ Claude API 호출 (streaming=True)
    ↓ SSE 이벤트 스트리밍
[PostgreSQL]
    - conversations
    - messages
[Claude claude-sonnet-4-6 API]
```

### 4.2 API 엔드포인트

#### `POST /api/chat`

```python
# Request
{
  "message": "Akkusativ가 뭐예요?",
  "unit_id": "A1-13",
  "level": "A1",
  "conversation_id": "uuid-or-null"  # null이면 새 대화 생성
}

# Response: SSE Stream
data: {"type": "token", "content": "Akkusativ는"}
data: {"type": "token", "content": " 독일어에서"}
...
data: {"type": "done", "conversation_id": "uuid", "message_id": "uuid"}
data: [DONE]
```

#### `GET /api/conversations?unit_id=A1-13`

```python
# Response
[
  {
    "id": "uuid",
    "unit_id": "A1-13",
    "message_count": 8,
    "last_message_at": "2026-02-25T10:00:00Z"
  }
]
```

#### `GET /api/conversations/{id}/messages`

```python
# Response
[
  {"role": "user", "content": "...", "created_at": "..."},
  {"role": "assistant", "content": "...", "created_at": "..."}
]
```

### 4.3 시스템 프롬프트 빌드

```python
UNIT_SUMMARY_TABLE = """
| ID | Band | 제목 | 유형 | 핵심 주제 |
|----|------|------|------|----------|
| A1-1  | 1 | 알파벳과 발음 익히기 | vocabulary | 알파벳 26자, 발음 |
| A1-2  | 1 | 자기소개1 - 인사하기 | conversation | Hallo, Auf Wiedersehen |
... (56개 전체)
"""  # ~1,200 token. 빌드 시 고정 상수로 관리

def build_system_prompt(level: str, unit_id: str) -> str:
    level_cfg = LEVEL_CONFIG[level]
    unit = get_unit_by_id(unit_id)  # DOKDOKDOK_A1에서 조회

    return f"""당신은 독일어 {level} 레벨 전문 튜터입니다.

## 레벨 지침
{level_cfg['system_prompt_modifier']}

## 전체 교재 구조 (참고용)
{UNIT_SUMMARY_TABLE}

## 현재 학습 단원
- 단원: {unit['id']} {unit['title']}
- 유형: {unit['type']}
- 핵심 주제: {', '.join(unit['topics'])}
- 컨텍스트: {unit['context_prompt']}

## 답변 포맷 (반드시 준수)
1. 한국어로 개념 설명
2. 예문: **핵심 단어 볼드** 독일어 문장
3. 번역: 한국어 번역
4. 문법: 해당 문법 포인트 한 줄
5. 💡 팁: 추가 학습 포인트

## 제약사항
- {level} 레벨 범위 이탈 질문은 거절하고 안내 메시지 반환
- 예문은 최대 {level_cfg['max_example_length']}단어 이내
- 한국어 또는 독일어 질문 모두 처리 (언어 자동 인식)
"""
```

### 4.4 Streaming 엔드포인트 (FastAPI)

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from anthropic import Anthropic
import asyncio

client = Anthropic()

@app.post("/api/chat")
async def chat(request: ChatRequest, session: Session = Depends(get_session)):
    # 1. 대화 조회 또는 생성
    conversation = await get_or_create_conversation(
        session_id=session.id,
        unit_id=request.unit_id,
        conversation_id=request.conversation_id
    )

    # 2. 히스토리 조회 (최근 10개)
    history = await get_messages(conversation.id, limit=10)

    # 3. 시스템 프롬프트 빌드
    system_prompt = build_system_prompt(request.level, request.unit_id)

    # 4. 메시지 저장 (user)
    await save_message(conversation.id, "user", request.message)

    # 5. SSE 스트리밍
    async def generate():
        full_response = ""
        try:
            with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    *[{"role": m.role, "content": m.content} for m in history],
                    {"role": "user", "content": request.message}
                ]
            ) as stream:
                for text in stream.text_stream:
                    full_response += text
                    yield f"data: {json.dumps({'type': 'token', 'content': text})}\n\n"

            # 6. 완료 후 assistant 메시지 저장
            msg = await save_message(conversation.id, "assistant", full_response)
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': str(conversation.id), 'message_id': str(msg.id)})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 4.5 에러 처리 & 재시도 (FastAPI)

```python
import asyncio
from anthropic import APIError, APITimeoutError, RateLimitError

async def call_claude_with_retry(messages, system_prompt, max_retries=3):
    delays = [1, 2, 4]  # exponential backoff (초)

    for attempt in range(max_retries):
        try:
            return client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system_prompt,
                messages=messages
            )
        except (APITimeoutError, RateLimitError, APIError) as e:
            if attempt == max_retries - 1:
                raise  # 3회 모두 실패 시 에러 전파
            await asyncio.sleep(delays[attempt])
            # 유저에게는 투명: 재시도 중임을 SSE로 알리지 않음
```

### 4.6 Streaming 에러 발생 시 (이미 토큰 렌더링 중)

```
에러 발생 상황: 30개 토큰 렌더링 완료 → 서버 에러
  ↓
자동 재시도 (유저에게 투명)
  - 성공: 이전 부분 응답은 지우고 새 응답으로 교체
  - 3회 모두 실패: SSE error 이벤트 전송
    → 클라이언트: 부분 응답 제거 + "답변 생성 중 오류가 발생했습니다. 다시 시도해주세요." 표시
```

---

## 5. User Experience

### 5.1 메시지 전송 플로우

```
[정상 플로우]
사용자 메시지 입력 → 전송 클릭
  → 입력창 비활성화 (전송 중 잠금)
  → 사용자 메시지 UI에 즉시 표시
  → 로딩 인디케이터 (점 3개 애니메이션)
  → 토큰 스트리밍 시작 → 텍스트 점진적 렌더링
  → 완료: 입력창 활성화
```

```
[큐잉 플로우 — Streaming 중 새 메시지 전송]
Streaming 진행 중 → 사용자가 새 메시지 입력 후 전송
  → 메시지 대기열에 추가
  → 입력창 아래 반투명 배지: "1개 대기 중"
  → 현재 Streaming 완료 후 → 자동으로 다음 메시지 처리 시작
  → 배지 사라짐
```

### 5.2 에러 메시지 (사용자용)

| 에러 상황 | 사용자 메시지 |
|----------|-------------|
| API 타임아웃 | "답변 생성에 시간이 걸리고 있어요. 잠시 후 다시 시도해주세요." |
| API 오류 (3회 재시도 후) | "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |
| 빈 메시지 전송 | 전송 버튼 비활성화 (클라이언트 검증) |
| 500자 초과 | "메시지가 너무 깁니다. 500자 이내로 입력해주세요." |
| 레벨 범위 이탈 | "현재 A1 모드에서는 A1 범위 질문만 답변 가능합니다." |

### 5.3 UI 상태 정의

| 상태 | 입력창 | 전송 버튼 | 추가 요소 |
|------|--------|----------|----------|
| 대기 중 | 활성 | 활성 (파란색) | — |
| Streaming 중 | 비활성 (잠금) | 회색 | 로딩 인디케이터 |
| 큐잉 중 | 활성 | "대기열 추가" 텍스트 | "1개 대기 중" 배지 |
| 에러 | 활성 | 활성 | 에러 메시지 인라인 |

---

## 6. Edge Cases

### EC-1: Streaming 중 브라우저 탭 닫기

- **상황**: Streaming 응답 중 유저가 탭을 닫음
- **처리**: SSE 연결 끊김 감지 → 서버에서 stream 중단. DB에는 partial 응답을 저장하지 않음 (완료 시에만 저장)

### EC-2: 단원 선택 없이 메시지 전송

- **상황**: 유저가 단원을 선택하지 않은 상태에서 질문
- **처리**: 기본 단원 적용 (A1-1 알파벳). 시스템 프롬프트에 "단원 미선택" 상태 명시

### EC-3: max_tokens 도달로 응답 잘림

- **상황**: Claude 응답이 1,024 토큰 한도에 도달하여 중간에 끊김
- **처리**: `stop_reason: "max_tokens"` 감지 → SSE에 `{"type": "truncated"}` 이벤트 추가 → UI에 "... (답변이 너무 길어 잘렸습니다. 이어서 질문해주세요)" 표시

### EC-4: 네트워크 끊김 후 재연결

- **상황**: 유저 기기의 네트워크가 일시적으로 끊겼다가 재연결
- **처리**: SSE 연결 자동 재수립 (브라우저 기본 동작). 이미 수신한 토큰은 UI에 유지

### EC-5: 동일 단원 매우 긴 대화 (히스토리 100개+)

- **상황**: 한 단원에서 50번 이상 대화
- **처리**: API 호출 시 최근 10개만 포함. DB에는 전체 저장. 유저는 스크롤로 이전 대화 열람 가능

---

## 7. DB Schema (F1 관련)

```sql
-- 세션 (Auth 없는 유저 식별)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT NOW(),
    last_active_at TIMESTAMP DEFAULT NOW()
);

-- 대화
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    unit_id VARCHAR(10) NOT NULL,          -- 'A1-13'
    textbook_id VARCHAR(50) NOT NULL DEFAULT 'dokdokdok-a1',
    level VARCHAR(10) NOT NULL DEFAULT 'A1',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 메시지
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_conversations_session_unit ON conversations(session_id, unit_id);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
```

---

## 8. Frontend 구현 (Next.js 15)

```typescript
// hooks/useChat.ts
export function useChat(unitId: string, level: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string) => {
    // Streaming 중이면 큐에 추가
    if (isStreaming) {
      setQueue(prev => [...prev, content]);
      return;
    }

    setIsStreaming(true);

    // 유저 메시지 즉시 표시
    const userMsg = { role: 'user', content, id: crypto.randomUUID() };
    setMessages(prev => [...prev, userMsg]);

    // 빈 assistant 메시지 추가 (스트리밍 채울 placeholder)
    const assistantMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantMsgId }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, unit_id: unitId, level }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));

          if (data === '[DONE]' || data.type === 'done') {
            setIsStreaming(false);
            processQueue();  // 큐에 다음 메시지 있으면 처리
            break;
          }

          if (data.type === 'token') {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + data.content }
                : m
            ));
          }

          if (data.type === 'error') {
            // 에러 처리: 빈 assistant 메시지를 에러 메시지로 교체
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: '일시적인 오류가 발생했습니다. 다시 시도해주세요.' }
                : m
            ));
            setIsStreaming(false);
          }
        }
      }
    } catch (error) {
      setIsStreaming(false);
    }
  };

  const processQueue = () => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      sendMessage(next);
    }
  };

  return { messages, isStreaming, queue, sendMessage };
}
```

---

## 9. Testing Strategy

### Unit Tests (pytest)

```python
# tests/test_chat.py

def test_system_prompt_contains_level_config():
    prompt = build_system_prompt("A1", "A1-13")
    assert "A1" in prompt
    assert "약속하기" in prompt

def test_system_prompt_contains_all_56_units():
    prompt = build_system_prompt("A1", "A1-1")
    assert "A1-56" in prompt  # 전체 56개 단원 요약 포함

def test_out_of_level_prompt_instruction():
    prompt = build_system_prompt("A1", "A1-13")
    assert "레벨 범위 이탈" in prompt or "거절" in prompt

def test_history_truncation_to_10():
    # 15개 메시지 넣으면 최근 10개만 반환
    history = get_recent_messages(conversation_id, limit=10)
    assert len(history) <= 10
```

### 수동 테스트 시나리오

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T1 | A1-13 선택 → "약속할 때 뭐라고 해요?" | 예문 + 번역 + 문법 3요소 포함 |
| T2 | 답변 중 새 메시지 입력 | "1개 대기 중" 배지 표시 → 완료 후 자동 처리 |
| T3 | 브라우저 닫고 재방문 | 이전 대화 유지 (세션 쿠키) |
| T4 | A1 모드에서 "B2 접속법 알려줘" | 거절 메시지 + 안내 |
| T5 | 단원 A1-13 → A1-21 전환 | 새 대화 스레드 시작, A1-13 대화 보존 |
| T6 | 빠른 연속 메시지 5개 | 큐에서 순서대로 처리 |
| T7 | 500자 초과 입력 | 전송 버튼 비활성화 + 문자 수 경고 |

---

## 10. Implementation Checklist (Frozen)

> **Note**: 이 체크리스트는 설계 시점 스냅샷입니다. 실제 진행 상황은 `wrap-up/lingua-rag.md`에서 관리합니다.

---

## 11. Open Questions

> Open Questions는 `wrap-up/lingua-rag.md`에서 통합 관리합니다.

---

## 12. References

- [PRD](./prd.md) — 제품 전략 + 경쟁 분석
- [User Journey Map](./user-journey-map.md) — 사용자 여정
- [Wireframe Spec](./wireframe-spec.md) — UI 화면 설계
- [Anthropic Streaming Docs](https://docs.anthropic.com/en/api/messages-streaming)
- [FastAPI StreamingResponse](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)

---

**Next Steps**: `wrap-up/lingua-rag.md` 참조
