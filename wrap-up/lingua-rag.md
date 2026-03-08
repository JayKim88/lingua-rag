# LinguaRAG - Wrap Up

> **Project**: `/Users/jaykim/Documents/Projects/lingua-rag`
> **Scope**: Full stack (backend + frontend + infra)
> **Live**: https://lingua-rag.vercel.app

## Session: 2026-03-08 22:54

> **Context**: PDF drag/selection bug investigation + WORTLISTE-A1 RAG indexing + hover sentence validation filter

### Done
- chore(rag): `scripts/index_wortliste.py` new — WORTLISTE-A1 dedicated indexing script (176 chunks, `textbook_id="wortliste-a1"`, `unit_id=None`, `LESSON_START_PAGE=7`, filters "License Number:" watermark)
- feat(rag): Indexed WORTLISTE-A1 into DB — 176 chunks covering all A1 vocabulary (topics: Kennenlernen, Familie, Zeit, Essen, Gegenstände, Fortbewegung, Datum, Körper)
- feat(rag): `VectorSearchRepository.search_vocabulary()` — cross-unit vocabulary search, `max_distance=0.65` (stricter than textbook 0.7)
- feat(rag): Dual parallel RAG search in `chat.py` — `asyncio.gather()` runs textbook search (unit-scoped, top 2) + vocabulary search (wortliste-a1, top 2) simultaneously
- feat(rag): Enable RAG — `RAG_ENABLED=True` set in `backend/.env`
- fix(pdf): `extractSentence` — add `isValidGermanSentence` guard after sentence boundary detection; blocks hover on non-sentence content:
  - Less than 3 words
  - Exercise labels: `b)`, `c)`, `1)` patterns
  - Audio markers: `MP3`, `CD`, `Track`
  - Book title metadata: `Zusammen A1` pattern
  - Repeated 2-word sequences (≥2 occurrences) — catches "richtig oder falsch richtig oder falsch..."

### Decisions
- **WORTLISTE `unit_id=None`**: Vocabulary list is topic-organized (Kennenlernen, Essen…), not lesson-ordered. No unit-scoping; searched globally across entire wortliste
- **Dual search strategy**: textbook (lesson content, broader threshold 0.7) + wortliste (vocabulary definitions, stricter 0.65). Combined top 4 chunks give LLM both lesson context and exact word definitions
- **RAG via .env not config.py default**: Changing `RAG_ENABLED` in `.env` is deployment-safe; default in code stays `False` so the feature can be toggled without code changes

### Issues
- **PDF drag/double-click still broken**: Multiple fix attempts (binary search `findCaretAt`, `user-select: none` + `e.preventDefault()`) were reverted at user request. Root causes identified but no solution accepted yet:
  - `caretRangeFromPoint` returns wrong offsets due to pdfjs `scaleX` CSS transform
  - `user-select: none` breaks `range.getClientRects()` and `window.getSelection().addRange()`
- **Hover box regression (original code)**: Hover effect `useEffect([], [])` runs at mount when `isRestoring=true` → `containerRef.current` is null → listener never attached. Fix identified (`[]` → `[file]`) but not yet applied

### Next
- [ ] Fix hover useEffect dependency: `[]` → `[file]` so listener attaches after PDF loads
- [ ] Fix double-click word selection — `handleDblClick` with `findCaretAt` + `wordBoundaries` (no `user-select: none`; use `e.preventDefault()` in mousedown instead)
- [ ] Consider migrating to `@react-pdf-viewer/core` — better scaleX transform handling for drag selection accuracy
- [ ] Restart backend server to apply RAG changes
- [ ] Test WORTLISTE RAG: ask "Freund 관사가 뭐야?" and verify wortliste chunk appears in logs
- [ ] Remove debug `console.log` from `PdfViewer.tsx` (`[extract]`, `[columns]`, `[sentence]`)
- [ ] Hover popup edge positioning — viewport top overflow fallback

---

## Session: 2026-03-08 22:54

> **Context**: Chat text hover/selection UX — match PDF behavior (German-only highlight, speaker prefix exclusion, popup positioning/clickability, hover blocking)

### Done
- feat(chat): `LineWithActions` hover highlight — mouseover on German text shows yellow highlight (`rgba(250, 204, 21, 0.35)`) with popup (speak/copy/inject/practice buttons)
- feat(chat): `splitAtArrow` — split line at "→" separator, highlight only German (primary) portion
- feat(chat): `splitAtKorean` — split at first Korean/CJK character boundary, exclude Korean text (translations, annotations like "(존댓말)") from highlight
- feat(chat): `extractSpeakerPrefix` — extract "A: ", "B: ", "Leo:" etc. from highlight area (both plain string and `<strong>B:</strong>` React element cases)
- fix(chat): Speaker prefix not extracted when leading `"\n"` node exists — `extractSpeakerPrefix` now skips leading whitespace-only string nodes before checking for prefix pattern
- feat(chat): `getNodeText` helper — recursively extract text content from any React node structure (handles array children in ReactMarkdown elements)
- feat(chat): Popup positioned at mouse X + text line top (like PDF), with `translateY(-100%)` to appear above
- feat(chat): `hoverHideTimer` 200ms delay — allows mouse to travel from text to popup without popup disappearing
- fix(chat): Hover reactivates immediately after selection popup closes — changed from timer-based to `mouseLeave`-based `clearHoverBlock`
- feat(chat): Hover events on `primaryRef` span only (not container div) — prevents Korean translation hover from triggering German highlight
- feat(css): Yellow selection highlight (`::selection`) scoped to `.chat-messages` class only (not input fields or other UI)
- feat(css): Unified yellow color across PDF and chat — hover `0.35`, selection `0.45`

### Decisions
- **mouseLeave-based hover block**: After selection popup closes, hover is blocked until mouse leaves the line entirely (matching PDF behavior). More reliable than timer-based approach
- **`getNodeText` recursive extraction**: ReactMarkdown `<strong>` elements may have non-string children (arrays, nested elements). Recursive text extraction handles all cases vs. brittle `typeof children === "string"` check
- **Leading whitespace skip in `extractSpeakerPrefix`**: ReactMarkdown inserts `"\n"` nodes as first children in multi-line paragraphs. Skipping these before prefix detection is necessary for correct extraction

### Issues
- **Node structure mismatch**: ReactMarkdown produces `["\n", "B: ", <strong>Ich komme aus Japan.</strong>, " → ..."]` — the leading `"\n"` caused `extractSpeakerPrefix` to check the wrong node. Discovered via temporary `console.log` debug logging of `Children.toArray` output

### Next
- [ ] Verify `extractSpeakerPrefix` fix works for all speaker prefix variations (A:, B:, Leo:, bold vs plain)
- [ ] Remove debug `console.log` statements from `PdfViewer.tsx` (`[extract]`, `[columns]`, `[sentence]`)
- [ ] Hover popup edge positioning — viewport top overflow fallback (display below instead of above)
- [x] Add hover sentence validation filter (`isValidGermanSentence`) — blocks exercise labels, repeated fragments, MP3 markers (from previous Next via this session)

---

## Session: 2026-03-06 23:28

> **Context**: PronunciationModal 전체 로직 버그 수정 — 마이크 지속, 더블 카운팅, 고유명사 인식 실패

### Done
- fix(modal): 2번째 연습부터 마이크 미동작 버그 수정 — 성공 감지 후 `stop()` 직후 final `onresult`가 재발화되어 타이머 2개 생성, 두 SpeechRecognition 인스턴스가 동시에 마이크 경쟁 → `if (phaseRef.current !== "listening") return` 가드 추가로 해결
- fix(modal): 모달 종료 후 마이크 유지 버그 — cleanup에서 `recRef.current = null` 설정 후 `abort()` 호출, 모든 `onend`/`onerror` 핸들러에 `rec !== recRef.current` stale instance 가드 추가
- fix(modal): `handleSpeak` TTS 재생 후 마이크 재시작 문제 — `abort()` 전에 `phaseRef.current = "done"` 설정하여 `onend`의 자동 재시작 차단; `mountedRef`로 언마운트 후 `waitAndRestart` 실행 방지
- fix(modal): TTS 재생 중 마이크가 TTS 소리를 인식하는 버그 — 동일한 `phaseRef` 선설정으로 해결
- fix(modal): wrongWord 오답 처리 개선 — `phaseRef.current = "done"` 먼저 설정 후 `stop()` 호출하여 `onend` 중복 재시작 경로 제거
- fix(modal): 고유명사(Pascal 등) 미매칭 — fuzzyMatch 임계값 완화 (`maxLen <= 3 → 1`, `<= 6 → 2`, `> 6 → 3`); 마지막 단어 wrongWord 리셋 제거 (STT가 고유명사 잘못 인식해도 전체 리셋 없이 재시도)
- refactor(modal): `fullResetRef` 제거, `onerror` 중복 재시작 경로 제거, `onend` 단일 재시작 경로로 통일

### Decisions
- **`continuous: false` 유지**: `continuous: true` 전환 시 성공 판정 로직 오동작 확인 → revert. 현재 구조에서는 `false`가 안정적
- **stale instance 패턴**: `recRef.current = null` (cleanup) + `rec !== recRef.current` (이벤트 핸들러 가드) 조합으로 SpeechRecognition lifecycle 관리
- **마지막 단어 관대 처리**: 고유명사/이름이 포함된 문장에서 마지막 단어 wrongWord 리셋을 제거하고 세션 자연 종료 후 재시도로 UX 개선

### Issues
- **STT 실시간 표시 지연**: `continuous: false`에서 단어별 interim result 빈도가 낮아 다음 단어가 나와야 텍스트 표시됨. `continuous: true`로 해결 가능하나 성공 판정 로직과 충돌 → 미해결

### Next
- [ ] `continuous: true` 환경에서 성공 판정 로직 재검토 — 실시간 표시 개선과 양립 가능한지 분석
- [ ] 고유명사 매칭 추가 개선 — 원문 텍스트에서 대문자 단어를 감지해 해당 단어만 threshold 높이기
- [ ] 발음 연습 완료 후 통계 저장 (몇 번 시도 만에 10회 성공 등)

---

## Session: 2026-03-04 22:08

> **Context**: User Feedback UI + MessageRepository 버그 수정 + Monitoring 강화 + AI Product Engineer 역량 로드맵 + P0-1 german_bold eval 개선 (4라운드)

### Done
- fix(repositories): MessageRepository 중복 클래스 정의 제거 — 두 번째 `class MessageRepository:` 선언이 첫 번째를 덮어써 `create()`/`get_recent()`/`get_all()` 손실 (대화 내역 사라지는 버그); `update_feedback()` 병합으로 수정
- feat(feedback): thumbs up/down UI — 응답 하단 👍/👎 토글 버튼, isSummary 제외, optimistic update
- feat(feedback): `PATCH /api/messages/{id}/feedback` — messages 테이블 `feedback TEXT` 컬럼 추가, Supabase 마이그레이션 적용
- feat(monitoring): `claude_service.py` — 스트림 완료 후 `usage` 이벤트 발행 (output/input/cache_read/cache_creation tokens)
- feat(monitoring): `messages.token_count` 실기록 — Claude API `final_message.usage.output_tokens` 저장
- feat(monitoring): `messages.rag_hit BOOLEAN` 추가 — 단원별 RAG 히트율 추적, Supabase `ALTER TABLE` 마이그레이션 적용
- feat(monitoring): 구조화 로그 `Token usage — unit=%s out=%d in=%d cache_read=%d cache_write=%d`
- docs: `docs/portfolio-story.md` + `docs/todo.md` — AI Product Engineer 역량 분석 + P0~P4 로드맵 반영
- fix(prompts): P0-1 R1 — ANSWER_FORMAT에 형태소 접사(`-en`/`-t`), 변환 표기(`ein→kein`), 문법 용어(`Dativ`), 팁 섹션 예시 추가 → german_bold 40%→50%, overall 90.0% 유지
- fix(prompts): P0-1 R2 — `ein/eine` in formulas, `haben`/`sein` in explanations, `bitte` variants, 대명사 예시 → german_bold 50%→55.6%, overall 90.0%→92.6%
- fix(prompts): P0-1 R3 — 괄호 안 활용형, `ge-`+`mach`+`-t` 구조 설명 예시 → german_bold 55.6%→60.0%, overall 92.6%→93.3%
- fix(prompts): P0-1 R4 — 괄호 안 활용형(`kommst`), 비교 요약(`kein Hund`), 인칭 활용(`ich habe`), 방향 어휘(`geradeaus`) 금지 예시 추가 (크레딧 부족으로 eval 미실행)

### Decisions
- **P0-1 judge hallucination 발견**: 3차 eval 결과 JSON 분석 시, 모델은 `**geradeaus**`, `**kein Hund**`, `**ich habe**` 등을 올바르게 bold 처리했음에도 judge가 "bold 없음"으로 판정하는 케이스 확인. 실제 모델 오류가 아닌 judge 평가 오류 → P0-2에서 judge 프롬프트 개선으로 해결
- **Monitoring 구조**: `claude_service.py`에서 `usage` 이벤트 발행 → `chat.py`에서 캡처 → `msg_repo.create(token_count, rag_hit)` 저장. `rag_hit = bool(rag_chunks)`로 계산
- **피드백 인프라 완성**: 👍/👎 UI + PATCH API + DB 저장 + token_count + rag_hit — "eval 수치 vs 사용자 만족도" 상관관계 분석을 위한 인프라 구축 완료 (데이터 수집 대기 중)

### Issues
- **API credit balance 부족**: P0-1 4차 eval 실행 시 "credit balance too low" 오류 → 크레딧 충전 후 재실행 필요

### Next
- [ ] API 크레딧 충전 후 P0-1 4차 eval 재실행 — 목표 70%+
- [ ] P0-2: Eval 의미론적 규칙 추가 (`correct_level`, `example_relevance`) + judge 프롬프트 개선 (hallucination 방지)
- [ ] P1-1: GitHub Actions eval CI 파이프라인 (`.github/workflows/eval.yml`, push to main 트리거, 5개 질문, <85% 경고)
- [ ] P2: 실사용자 확보 — 채널 선정 + 베타 게시물 작성
- [ ] Hover popup edge positioning — viewport top 오버플로우 시 아래 표시 fallback
- [ ] Run notes table migration in Supabase SQL editor (production)

---

## Session: 2026-03-03 14:51

> **Context**: PDF hover/selection popup UX improvements (button labels, order, click timing, hover suppression logic) + chat send cancel feature

### Done
- feat(pdf): Rename hover popup button — "채팅창에 붙여넣기" → "질문하기" ("Ask")
- feat(pdf): Reorder/rename selection popup buttons — [Ask, Read] → [Sound, Ask]
- fix(pdf): Make button click active effect visible — split `onMouseDown: e.preventDefault()` / `onClick: action+close` (popup was closing on mousedown before click effect rendered)
- fix(pdf): Sound button — keep popup open on click, close only on `onMouseLeave`
- fix(pdf): Hover popup closes on external click — added `pdf-hover-popup` outside-check in `handleMouseDown`
- feat(pdf): Selection popup `onMouseLeave` — auto-dismiss popup + clear selection on mouse-out
- feat(pdf): Prevent hover popup from reopening immediately after selection popup closes — `hoverBlockOriginRef` + 50px distance threshold
- fix(pdf): Root cause fix for hover popup immediate reopen (2-layer guard)
  - Fix 1: Cancel `hoverShowTimer` in the `popup`-watching useEffect when selection popup opens
  - Fix 2: Add `if (popupActiveRef.current) return` guard inside the timer callback
- fix(pdf): Strengthen hover detection — add Latin character check on `extractSentenceText` result to block hover on non-German text
- feat(chat): `useChat` — add `cancelMessage` (clear queue + `AbortController.abort()`)
- feat(chat): `InputBar` — swap send button to red stop (■) button while streaming, add `onCancel` prop
- feat(chat): `ChatPanel` — wire `cancelMessage` to `InputBar.onCancel`
- feat(chat): Show `_응답이 취소되었습니다._` on cancel — `wasAborted` local flag + content update in `finally` block

### Decisions
- **onMouseDown/onClick split**: `e.preventDefault()` in `mousedown` prevents text deselection. Actual action+close moves to `onClick` (fires after mouseup) → CSS `active:scale-95` effect now visible
- **popupActiveRef two-layer guard**: Distance block alone cannot stop an in-flight async timer callback from setting state. Both useEffect cancel + callback guard are needed
- **wasAborted local variable**: Declared in `processMessage` closure scope → set in `catch`, accessed in `finally`. No extra ref needed

### Issues
- **Hover popup immediate reopen**: `hoverBlockOriginRef` distance check only blocks new entries via `handleMouseMove`. An already-running 400ms timer callback cannot be blocked this way → solved by two-layer guard

### Next
- [ ] Hover popup edge positioning — popup overflows viewport top when hovering near top of page (fallback to display below)
- [ ] Run notes table migration in Supabase SQL editor (production)
- [ ] Verify `Connection: close` fix in production — check for `UND_ERR_SOCKET` recurrence
- [x] Apply Prompt Caching — reduce cost/latency for system prompt
- [x] Plan v0.3 kickoff (LLM-as-judge format validation)

---

## Session: 2026-03-03 23:41

> **Context**: LLM-as-Judge 평가 시스템 구축 (v0.3 Phase 1) + getText() fallback 개선 + tight list hover fix

### Done
- fix(frontend): `MessageList.tsx` — add `li` override to `MARKDOWN_COMPONENTS` (tight list items now wrapped in `LineWithActions`; loose lists with `ParagraphRenderer` children pass through unchanged)
- feat(eval): `scripts/test_questions.json` — 10개 고정 테스트 질문 (단원별 포맷 유혹 케이스 포함)
- feat(eval): `scripts/evaluate.py` — LLM-as-judge runner
  - 6규칙: german_bold_complete, no_markdown_table, translation_inline, dialogue_structure, example_length_ok, tip_included
  - Judge: claude-sonnet-4-6 (Haiku → Sonnet 업그레이드)
  - `_parse_judge_json()`: markdown fence 제거 + JSON boundary fallback + retry
  - 출력: 콘솔 리포트 + `scripts/results/YYYY-MM-DD_HHMM.json`
- fix(prompts): `backend/app/data/prompts.py` — ANSWER_FORMAT bold 규칙 강화
  - 추가 예시: 괄호 안 (`남성 명사(**der**)는`), 헤딩 (`## **kein** / **keine**`), 국가명 (`**Deutschland**`), 형태소 (`**ge-** + **-t**`)
- chore(eval): Baseline 실행 → 프롬프트 개선 후 83.3% → 90.0% 달성
- docs: `docs/todo.md` — 완료 항목 [x] 체크, v0.3 완료 항목 통합 갱신
- refactor(frontend): `MessageList.tsx` `getText()` fallback 개선 — Korean strip → Latin 단어 시퀀스 추출 (`/[a-zA-ZÀ-ÖØ-öø-ÿ]+/g`)

### Decisions
- **`getText()` Latin extraction**: 이 앱 컨텍스트에서 Latin 문자 = 독일어 (고신뢰). Korean strip은 기호/숫자 잔여물 남김 → Latin 추출이 더 안전
- **`<strong>` = 의미적 독일어 마커**: Bold는 TTS 추출 메커니즘. LLM 준수율 개선이 근본 해결책이며, `<strong>` 1순위 + Latin 추출 fallback 구조 유지
- **Judge Sonnet 업그레이드**: Haiku는 어휘 목록 bold 여부 등에서 false positive 발생. Sonnet 교체 후 정확도 향상

### Issues
- **Judge JSON malformed**: 한국어 reason에 특수문자 포함 시 JSON string delimiter 오류 → `_parse_judge_json()` fallback + "reason은 한 줄 문자열" 지시로 완화
- **Judge self-contradiction**: reason이 PASS 설명인데 `pass: false` 반환 (q04, q10). "pass 값과 reason 일치" 지시 추가로 부분 완화

### Next
- [x] User Feedback UI — 응답 하단 👍/👎 버튼 + `message_feedback` DB 테이블 (v0.3 Phase 2)
- [ ] 실사용자 확보 — 채널 선정 (Reddit r/German, Discord, Naver 카페)
- [ ] Hover popup edge positioning — viewport top 오버플로우 시 아래 표시 fallback
- [ ] Run notes table migration in Supabase SQL editor (production)
- [ ] Verify `Connection: close` fix in production

---

## Session: 2026-03-03 14:51

> **Context**: Sound settings UX overhaul (modal move + draft state) + useTTS simplification + Notes/Memo feature

### Done
- refactor(tts): `hooks/useTTS.ts` — remove pitch, remove voice selection, set Google Deutsch as default (reorder `PREFERRED_VOICE_NAMES`), keep `isSpeaking`. Returns: `{ speak, volume, setVolume, rate, setRate, isSpeaking }`
- refactor(tts): `components/InputBar.tsx` — remove volume/rate/pitch props + sound settings popover
- refactor(tts): `components/ChatPanel.tsx` — remove `useTTS` call, receive `speak` as prop
- feat(sound-modal): `app/chat/page.tsx` — move sound settings from user menu popover to a centered modal via "Sound Settings" button
- fix(sound-modal): Introduce draft state for sliders — `draftVolume`, `draftRate`. Initialize from saved values when modal opens. X button discards changes; only Save button commits via `setVolume`/`setRate` → localStorage
- fix(sound-modal): Test button — create a temporary utterance directly using draft values (bypasses `useTTS`)
- fix(tts): `app/chat/page.tsx` — fix TypeScript errors from pitch/voice removal (remove pitch slider, voice selection JSX)
- feat(resize): Chat panel drag handle double-click resets width to `CHAT_DEFAULT` (560px) via `onDoubleClick`
- feat(notes): `backend/schema.sql` — add `notes` table + `idx_notes_user_unit` index
- feat(notes): `backend/app/models/schemas.py` — add `NoteCreate`, `NoteOut`, `NoteListResponse`
- feat(notes): `backend/app/db/repositories.py` — add `NoteRepository` (`list_by_user_unit`, `create`, `delete`)
- feat(notes): `backend/app/routers/notes.py` new — `GET /api/notes?unit_id=`, `POST /api/notes`, `DELETE /api/notes/{id}`
- feat(notes): `backend/app/main.py` — register notes router
- feat(notes): `frontend/lib/types.ts` — add `SavedNote` interface
- feat(notes): `frontend/lib/notes.ts` new — `getNotes`, `saveNote`, `deleteNote` API helpers
- feat(notes): `frontend/app/api/notes/route.ts`, `[id]/route.ts` new — FastAPI proxy
- feat(notes): `components/InputBar.tsx` — add `onMemo` prop + "Memo" button (next to "Summarize")
- feat(notes): `components/ChatPanel.tsx` full overhaul
  - "Saved Summaries" → **"Notes"** (badge: summaries + memos combined)
  - Add memo CRUD state + `reloadNotes`
  - **Memo write modal** (closes on outside click, loading state while saving)
  - Add **Summary / Memo tabs** in Notes overlay (click item → detail view)

### Decisions
- **Sound settings modal with draft state**: Switch from immediate slider apply to draft pattern. Closing with X preserves old values; only Save triggers `setVolume`/`setRate` → localStorage write
- **Single Google Deutsch voice**: Remove multi-voice selection UI. Auto-select by `PREFERRED_VOICE_NAMES` priority order. Voice picker adds complexity with minimal UX gain
- **Single useTTS instance (page.tsx)**: PDF viewer and chat panel share same TTS settings. Prop-drilling `speak` is cleaner than two independent instances
- **notes as separate table**: Separate summaries (AI-generated) from notes (user-written). Same schema structure but semantically distinct

### Issues
- **Multiple TypeScript errors (pitch/voice)**: After useTTS simplification, page.tsx still destructured pitch, setPitch, availableVoices, selectedVoiceName, setVoiceName → fixed by removing from destructuring + deleting JSX blocks
- **notes DB migration**: Must run `CREATE TABLE notes...` manually in Supabase SQL editor (local schema.sql updated; production DB requires separate apply)

### Next
- [ ] Run notes table migration in Supabase SQL editor (production)
- [ ] Verify `Connection: close` fix — check `UND_ERR_SOCKET` recurrence in production after backend redeploy
- [ ] Apply Prompt Caching — cache system prompt to reduce cost/latency
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation)
- [ ] Hover popup edge positioning — popup overflows viewport top when hovering near page top

---

## Session: 2026-03-02 23:56

> **Context**: Summary feature completion (InputBar move + German action buttons in summary overlay) + summaries Supabase migration + RAG flag disable + SSE empty response / login 500 bug fixes

### Done
- feat(summary): `MessageList.tsx` — export `ChatActionsCtx`, `MARKDOWN_COMPONENTS` (reused in summary detail view)
- feat(summary): `InputBar.tsx` — add `onSummary`, `showSummary` props + place "Summarize" button left of volume control (disabled during streaming, hidden when summary is open)
- feat(summary): `ChatPanel.tsx` — `handleSend` wrapper: auto-close summary overlay before calling `sendMessage`
- feat(summary): summary detail view — wrap with `ChatActionsCtx.Provider` to enable German text sound/copy/inject buttons
- feat(db): `schema.sql` — add `summaries` table + indexes (`user_id`, `unit_id`, `saved_at DESC`)
- feat(backend): `schemas.py` — add `SummaryCreate`, `SummaryOut`, `SummaryListResponse`
- feat(backend): `repositories.py` — add `SummaryRepository` (`list_by_user_unit`, `create`, `delete`)
- feat(backend): `routers/summaries.py` new — `GET /api/summaries?unit_id=`, `POST /api/summaries`, `DELETE /api/summaries/{id}`
- feat(backend): `main.py` — register summaries router, add DELETE to `allow_methods`
- feat(frontend): `lib/summaries.ts` full replacement — localStorage → Supabase API (async `getSummaries(unitId)`, `saveSummary`, `deleteSummary`)
- feat(frontend): `app/api/summaries/route.ts`, `app/api/summaries/[id]/route.ts` new — FastAPI proxy
- refactor(ChatPanel): Convert all summary callbacks to async
- feat(rag): `config.py` — add `RAG_ENABLED: bool = False` flag
- fix(rag): `chat.py` — wrap RAG block with `if settings.RAG_ENABLED:`
- fix(sse): `chat.py` — `Connection: keep-alive` → `Connection: close` (resolves undici `UND_ERR_SOCKET`)
- fix(sse): `app/api/chat/route.ts` — remove ReadableStream wrapper, restore `new Response(backendResponse.body)` direct pipe (fixes empty response bug)
- fix(auth): `middleware.ts` — wrap `supabase.auth.getUser()` in try/catch + use `new URL("/login", request.url)` for clean redirect (removes 500 error + `__nextDefaultLocale=` query string)
- fix(ux): `chat/page.tsx` — stop deleting `lingua_unit`/`lingua_level` localStorage on sign-out → restores last unit automatically on re-login

### Decisions
- **RAG_ENABLED=False**: Vision (page_image) already provides direct textbook context. No clear benefit from RAG given added latency/cost. Flag allows re-enabling anytime
- **summaries localStorage → Supabase**: Moved to server storage for per-unit filtering, multi-device sync, and data persistence. Filtering done at query level with `unit_id` WHERE clause
- **Connection: close**: Explicitly tells undici that FastAPI will close connection after streaming → removes `UND_ERR_SOCKET` warning. ReadableStream wrapper caused last chunk loss (empty response), so direct pipe is kept

### Issues
- **`UND_ERR_SOCKET: other side closed`**: undici detected mismatch between FastAPI `Connection: keep-alive` header and actual connection close. Adding ReadableStream wrapper caused `catch` to swallow last chunk → empty chat response. Fix: FastAPI `Connection: close` + restore direct pipe
- **`GET /login?__nextDefaultLocale= 500`**: `request.nextUrl.clone()` preserved stale query params → Supabase token parse failure. Fixed with `new URL("/login", request.url)`
- **localhost OAuth → production redirect**: `http://localhost:3000/**` not registered in Supabase dashboard Redirect URLs. Code already uses `window.location.origin` → fixed by adding URL in dashboard

### Next
- [ ] Verify `UND_ERR_SOCKET` fix in production after backend redeploy
- [ ] Apply Prompt Caching — cache system prompt (Low effort / High impact)
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation)
- [ ] Hover popup edge positioning — popup overflows viewport top when hovering near top of page

---

## Session: 2026-03-02 23:54

> **Context**: PDF viewer UX overhaul (hover search panel, optional PDF panel, file management modal) + empty chat response bug fix

### Done
- feat(frontend): PDF search panel → absolute overlay (hover + Cmd+F, 150ms leave delay)
- feat(frontend): Optional PDF panel — opens via centered modal on "View PDF" button click, persists `showPdf` in localStorage
- feat(frontend): PDF picker modal new — file upload drop zone + recent files list + delete (IDB + localStorage)
- feat(frontend): `lib/pdfLibrary.ts` new — extracted IDB/localStorage helpers from PdfViewer (SSR-safe)
- fix(frontend): Chat panel disappears when PDF opens — `flex-1` (flex-basis:0) → `shrink-0 + style.width`
- fix(frontend): Modal recent file delete button always visible (removed `opacity-0 group-hover:opacity-100`)
- fix(backend): Fix missing `settings` import in `chat.py` — `NameError` caused completely empty chat response

### Decisions
- **`shrink-0` vs `flex-1`**: With PDF visible, `flex-1` on chat section caused `flex-basis:0` to override inline `width` → chat panel disappeared. Use `shrink-0 + style={{ width: chatWidth }}` when PDF is shown
- **`lib/pdfLibrary.ts` extraction**: Static import of PdfViewer in `page.tsx` ran `react-pdf` in SSR → error. Extracted IDB/localStorage helpers to pure TS; PdfViewer stays as `dynamic(..., { ssr: false })`

### Issues
- **`setState` inside updater**: `setShowPdf(v => { setPageImage(null); return !v; })` — calling setState inside updater is unstable in React. Separated into two calls
- **`import` position error**: Import placed after pdfjs worker setup code → ES module parse failure. Moved all imports to top of file
- **StreamingResponse silent fail**: FastAPI sends 200 headers then runs generator. Exception outside `try/except` (`NameError`) → connection closes with empty body. Frontend sees 200 OK but empty response

### Next
- [ ] Redeploy backend (apply settings import fix)
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation)
- [ ] Design progress tracking UX (how to handle completed units)
- [ ] Evaluate STT (external API vs Web Speech API)

---

## Session: 2026-02-27 20:14

> **Context**: RAG indexing quality improvement — 100% unit detection accuracy, remove appendix, fix unit names, deploy

### Done
- fix(rag): `index_pdf.py` — rewrite Korean unit header patterns
  - Format A: `r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]{10,}\S"` (10+ spaces)
  - Format B: `r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]*\n[ \t]{15,}[\uAC00-\uD7A3]"` (15+ spaces + Korean char)
- fix(rag): `LESSON_START_PAGE=10` — skip unit detection on TOC/cover pages (1-9)
- fix(rag): `LESSON_END_PAGE=178` — exclude appendix/answer key pages (178+) from chunking
- fix(rag): `MAX_UNIT_STEP=5` — prevent false-positive page number detection (monotonic step guard)
- fix(rag): Pre-filter copyright watermark lines (`SKIP_IF_CONTAINS` line-level filter)
  - Added: "License Number", "Zusammen A1", "독독독 독일어"
- feat(data): `units.py` + `types.ts` — full replacement of all 56 unit titles/band names to match actual textbook
- fix(db): `connection.py` — pool `timeout` 20s→60s, add `max_inactive_connection_lifetime=300`
- chore(rag): Re-index (--clear) → 244 → **186 chunks** (removed 58 appendix chunks, all A1-1~A1-56 retained)
- chore(deploy): `git push main` → triggered Render + Vercel auto-deploy

### Decisions
- **LESSON_END_PAGE=178**: Appendix of Dokdokdok A1 starts at page 178. Eliminated 40 noise chunks being indexed under A1-56
- **Format B `[\uAC00-\uD7A3]` requirement**: Page footers starting with Latin chars ("Zusammen A1") were false-positives. Requiring Korean character prevents these
- **MAX_UNIT_STEP=5**: Odd page numbers (11, 13, 15...) were being detected as same-numbered units. "Previous unit + 5 max" condition eliminates this pattern entirely. No false negatives since normal units always advance by +1

### Issues
- **RAG verification confusion**: User tested with "Can you view the PDF?" (meta question) → Claude responded "cannot view PDF". Actual German content question ("Das ist ein Nudelgericht. is this true?") confirmed RAG working correctly. OPENAI_API_KEY was already set in Render

### Next
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation)
- [ ] Design progress tracking UX (how to handle completed units)
- [ ] Evaluate STT (external API vs Web Speech API)

---

## Session: 2026-03-02 23:54

> **Context**: PDF viewer hover popup implementation — mouseover on German sentence triggers sound/copy/inject buttons popup

### Done
- feat(pdf): `PdfViewer.tsx` hover popup implementation
  - `HoverPopup` interface + `hoverPopup` state
  - `hoverShowTimer` (400ms) / `hoverHideTimer` (200-300ms) ref pattern for flicker-free show/hide
  - `popupActiveRef` blocks hover popup when selection popup is active
  - 3 buttons: Sound / Copy / Inject to chat (with `active:scale-95` click effect)
- feat(pdf): `extractSentenceText` — full rewrite using span-level sentence boundary detection
  - Before: character-level `.!?` search → incorrectly included vocabulary metadata (172, ●●●, translations)
  - After: traverse adjacent spans in reading order, use Korean/CJK, pure symbols, and punctuation as boundaries
  - 2-line sentence handling: `"Welche Dokumente…"` + `"beilegen?"` → merged and returned
- fix(pdf): Leaf element check — block hover on container spans where `childElementCount > 0`
- fix(pdf): Hover target filter — only allow spans starting with a letter or digit+letter (excludes 172, ●●●, Korean translation spans)
- fix(pdf): Fix popup lingering on fast mouse-out
  - Non-leaf/non-text spans only called `clearShow()` without setting hide timer → popup stayed forever
  - Added `clearHide()` + 200ms hide timer for those cases too
- fix(pdf): Add `file` to `useEffect` dependency array — fixes missing event listener registration before PDF loads

### Decisions
- **Span-level detection adopted**: Character-level approach cannot handle vocabulary PDFs (mixed numbers, symbols, translations). Span-based approach using Korean/symbols as boundaries is more robust to PDF structure
- **Korean spans fully excluded from hover**: In a German learning app, Korean translation spans are not targets for sound/copy. Removed `\u1100-\uD7FF` from `startsWithLetter` regex

### Next
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation)
- [ ] Design progress tracking UX (how to handle completed units)
- [ ] Evaluate STT (external API vs Web Speech API)
- [ ] Hover popup edge positioning — when hovering near top of page, popup overflows viewport top; consider fallback to display below

---

## Progress

### v0.1 — Claude Streaming Q&A

| Feature | Status | Note |
|---------|--------|------|
| FastAPI + SSE Streaming (FR-1) | Done | `POST /api/chat`, uvicorn + uvloop |
| Dynamic system prompt (FR-2) | Done | Level + unit context build |
| Response format consistency (FR-3) | Done | Prompt-based (LLM-as-judge in v0.3) |
| Conversation history DB storage (FR-4) | Done | Last 10 messages as context |
| Conversation history UI | Done | Load DB history on unit switch |
| Unit selection UI | Done | Sidebar 56 units + level selection onboarding |
| Out-of-level handling (FR-5) | Done | Prompt-based rejection |
| Session cookie user identification (FR-6) | Done | httponly cookie (lingua_session, 30 days) |
| German TTS | Done | Web Speech API `de-DE`, volume control |
| Render cold start handling | Done | Warmup banner + useBackendHealth hook |
| Deploy (Render + Vercel) | Done | Backend + DB: Render, Frontend: Vercel |
| max_tokens truncation (OQ-4) | Done | 1024 → 2048 increase, improved truncation message |
| Tests (pytest) | Done | f1-spec Section 9, 29/29 scenarios pass |

### v0.2 — RAG + PDF Vector Search (Complete)

- [x] Embedding model selection — text-embedding-3-small (ADR-003)
- [x] PDF parsing + chunking pipeline — pdftotext + chunk_text, 250 chunks
- [x] pgvector extension + vector search — VectorSearchRepository, cosine distance
- [x] RAG → Claude system prompt injection — top-3 chunks injected in real-time
- [x] Production validation — Render log "RAG: found 3 chunks for unit A1-1" confirmed
- [ ] STT/TTS enhancement (evaluate external API)
- [x] DB: Render PostgreSQL → Supabase migration (pgvector + resolves 90-day limit)
- [ ] Learning reminder notifications ← user-journey-map.md

### v0.3 — Quality + Auth (Not started)

- [ ] LLM-as-judge format validation
- [x] User authentication (Supabase Auth) — Google OAuth + JWT ES256 complete

### Open Questions

| # | Question | Status | Source |
|---|----------|--------|--------|
| OQ-1 | Session cookie expiry? (7 days? 30 days?) | **Resolved** — Switched to JWT, cookie session retired | f1-spec |
| OQ-2 | Strategy after Render PostgreSQL 90-day limit | **Resolved** — Supabase migration complete | decisions.md |
| OQ-3 | Is ~1,200 token cost for 56-unit summary acceptable? | Needs check (~$0.02/question OK) | f1-spec |
| OQ-4 | Does max_tokens 1,024 truncate long grammar explanations? | **Resolved** — Increased to 2048 | f1-spec |
| OQ-5 | Dokdokdok copyright verification | Unconfirmed | — |
| OQ-6 | Multi-device scenario (session cookie limitation) | **Resolved** — user_id-based history, shared across devices with same Google account | — |

### UX Open Items

| Item | Status | Source |
|------|--------|--------|
| Completed unit handling (button vs auto) | Undecided | wireframe-spec.md |
| Mobile drawer auto-close | Undecided | wireframe-spec.md |
| Answer copy button | Done | Copy icon on hover, 1.5s "Copied" feedback |
| Progress tracking UX detailed design | Not started | user-journey-map.md |

### Business/GTM (Timing TBD)

| Item | Status | Source |
|------|--------|--------|
| TAM: German learning market size research | Not started | prd.md |
| GTM: Content marketing channels + strategy | Not started | prd.md |
| Pricing: Pricing model review | Not started | prd.md |

---

## Session: 2026-02-27 18:56

> **Context**: v0.2 RAG completion — PDF indexing + pgvector search + Render production validation

### Done
- feat(rag): `scripts/index_pdf.py` — pdftotext (subprocess) based PDF extraction, 204 pages → 250 chunks
- fix(rag): Fixed 2 infinite loop bugs in `chunk_text()`
  - Bug 1: Search window going before `start` when seeking boundary → end = start+1 caused backward regression. Fixed with `search_begin > start` condition
  - Bug 2: When end >= length, start = end - overlap fixed → infinite loop. Fixed with `if end >= length: break`
- feat(rag): Generated embeddings for 250 chunks with OpenAI text-embedding-3-small, inserted into Supabase document_chunks
- fix(rag): `VectorSearchRepository.max_distance` 0.5 → 0.7 (practical threshold for current chunk quality)
- fix(deploy): Remove `pdfplumber` from `requirements.txt` (local-only script, not needed on Render)
- fix(deploy): `connection.py` — asyncpg pool `min_size` 2 → 1, add `timeout=20.0` (resolves Render cold start SSL timeout)
- chore(rag): Promote RAG hit log from DEBUG → INFO (visible in Render logs)
- chore(rag): Skip ivfflat index — sequential scan is faster for 250 rows; also avoids maintenance_work_mem error

### Decisions
- **pdftotext (CLI) adopted**: pdfplumber/pypdf both consumed 50GB memory due to chunk_text bug. pdftotext uses per-page subprocess calls to minimize Python heap
- **max_distance 0.7**: Current chunks are contaminated with copyright text, pushing actual distances to 0.61–0.63. Always 0 results at 0.5 → raised to 0.7
- **ivfflat index unnecessary**: pgvector sequential scan is faster than index for 250 rows. Revisit at 10K+ rows
- **pdfplumber excluded from server**: index_pdf.py is a one-time local script. No need for pdfminer/pypdfium2 large binaries in Render Docker

### Issues
- **50GB memory / exit 137**: Caused by chunk_text infinite loop, not the pdfplumber→pypdf→pdftotext switch
- **Render deploy failure (SSL TimeoutError)**: Resolved by removing pdfplumber dependency + adjusting min_size/timeout
- **ivfflat index creation failure**: `memory required is 59MB, maintenance_work_mem is 32MB` — Supabase free tier limit. Decided to operate without index

### Next
- [ ] Improve chunk quality: copyright notice (`*본 책은 저작권법에 의해...`) prepended to every chunk is noise. Filter at extraction time
- [ ] Verify unit detection: confirm that units detected with `Einheit/Lektion/Kapitel N` pattern (A1-1, A1-8, A1-15...) match actual textbook units
- [ ] Plan v0.3 kickoff (LLM-as-judge format validation, auth improvements)

---

## Session: 2026-02-27 16:04

> **Context**: Google OAuth login (Supabase Auth), JWT ES256 verification, sidebar user card UI, Vercel deploy complete

### Done
- feat(auth): Google OAuth login — Supabase Auth + `@supabase/ssr`, middleware route protection
- feat(auth): `deps/auth.py` — ES256 token verification via PyJWT JWKS client (`cryptography` + `certifi`)
- feat(db): Delete `sessions` table, replace with `conversations.user_id` (auth.users.id)
- feat(backend): `get_current_user` Depends — UUID extraction via `HTTPBearer` + JWKS
- feat(frontend): `lib/supabase/{client,server}.ts`, `middleware.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts` new
- feat(frontend): 3 API proxies — replace `lingua_session` cookie with `Authorization: Bearer` header
- feat(frontend): Sidebar bottom user card — initials avatar + name display, click for popover (email + logout)
- fix(auth): New Supabase project JWT algorithm HS256 → ES256 — switch to JWKS endpoint + `PyJWKClient`
- fix(auth): macOS Python 3.13 missing SSL certificate — explicitly inject `certifi` CA bundle into JWKS client
- fix(deploy): `middleware.ts` Next.js 15 type error — `RequestCookies.set(name, value, options)` → `(name, value)`
- fix(deploy): `frontend/app/setup/page.tsx` missing from initial commit → fixes 404
- chore(deps): `requirements.txt` — add `cryptography>=43.0.0`, `certifi>=2024.0.0`

### Decisions
- **Supabase Auth**: Already using Supabase DB → Google OAuth on same platform without additional services
- **JWKS/ES256**: New Supabase projects use ES256 instead of HS256. Removed `SUPABASE_JWT_SECRET` env var, compose JWKS endpoint from `SUPABASE_URL`
- **certifi explicit injection**: macOS Python.org installer doesn't use system keychain → `urllib` HTTPS fails. Explicitly pass `certifi.where()` as CA bundle. Not needed on Render (Linux) but works with same code
- **Cookie session fully removed**: `lingua_session` httponly cookie → Supabase JWT Bearer token. Resolves OQ-1 (expiry) and OQ-6 (multi-device)

### Issues
- **JWT alg mismatch (401)**: `deps/auth.py` tried HS256 decode → Supabase ES256 token verification failed. Identified by decoding token header, fixed by switching to JWKS
- **SSL CERTIFICATE_VERIFY_FAILED**: JWKS URL fetch failed in macOS Python 3.13 venv. Fixed by installing `certifi` via `.venv/bin/pip install certifi`
- **Vercel build failure 1**: `middleware.ts` TypeScript error — `RequestCookies.set()` in Next.js 15 doesn't accept 3rd options argument
- **Vercel build failure 2**: `frontend/app/setup/page.tsx` untracked → missing from commit → `/setup?level=A1` 404

### Next
- [x] Production E2E validation — confirm Render backend redeploy, Google login → chat → history sharing (multi-device)
- [x] Kick off v0.2 RAG — embedding model selection (ADR-003), PDF parsing pipeline, pgvector vector search

---

## Session: 2026-02-26 20:17

> **Context**: Full pipeline setup from local environment to Render/Vercel production deploy

### Done
- feat(backend): Fix pydantic-settings `DATABASE_URL` bug (`os.environ` → `settings.DATABASE_URL`)
- feat(frontend): German TTS via Web Speech API (click bold text → play pronunciation, volume slider)
- chore: Create `.gitignore` (`.env`, `node_modules`, `__pycache__`, `.next`)
- chore: Local environment setup (PostgreSQL@17, Python venv, npm install, `.env` file)
- chore(deploy): Render backend deploy (Docker, Singapore region, free tier)
- chore(deploy): Create Render PostgreSQL + initialize schema.sql
- chore(deploy): Vercel frontend deploy (Next.js, link `BACKEND_URL`)
- fix(security): Next.js 15.1.4 → 15.5.12 (CVE-2025-66478, unblocked Vercel deploy)
- docs: Update Railway → Render references (README, Dockerfile comments, ADR-004)
- docs: Consolidate planning documents (prd, user-journey-map, wireframe-spec → docs/)
- docs: Centralize TODOs (all doc TODOs → wrap-up Progress section)

### Decisions
- **Railway → Render**: Railway dropped free tier; chose Render free tier (trade-off: ~50s cold start, 90-day DB limit)
- **TTS: Web Speech API**: Use browser built-in `speechSynthesis` without external API (`de-DE`, rate 0.85)
- **Next.js API Route proxy**: Browser → Vercel `/api/chat` → Render backend (simplifies CORS, cookie passing)
- **Single tracking document**: Use wrap-up/lingua-rag.md as single progress tracker. docs/ for design reference only

### Issues
- Render Web Service name conflict: `linguarag-backend` already taken → eventually created successfully with same name
- Render first deploy failure: `messages` table not found error → resolved after redeploy
- Anthropic API credits: Claude Max plan credits are separate from API credits — needed to purchase $5 API credits separately

---

## Session: 2026-02-27

> **Context**: Conversation history UI + Render cold start handling

### Done
- feat(backend): Add `message_count` LEFT JOIN to `list_by_session` query
- feat(frontend): Add `/api/conversations`, `/api/conversations/[id]/messages`, `/api/health` proxy routes
- feat(frontend): `useChat` — auto-load DB history on unit switch (add `isLoadingHistory` state)
- feat(frontend): `useBackendHealth` hook — detect backend warmup (3s poll, max 20 attempts)
- feat(frontend): Sidebar Q&A badge — show conversation count per unit (`message_count / 2` rounded up)
- feat(frontend): Cold start banner — amber banner "Server is starting..." at top
- feat(frontend): ChatPanel history loading spinner

### Decisions
- **History load strategy**: On unit switch: `GET /api/conversations` → filter by unit_id → load messages from latest conversation. Reuses existing API without adding backend endpoints
- **Q&A badge calculation**: `Math.ceil(message_count / 2)` — convert to user+assistant pairs
- **Cold start banner**: `checking` → transitions to `warming` if no response initially. Hides immediately on success

---

## Session: 2026-02-27 (3rd)

> **Context**: DB migration (Render PostgreSQL → Supabase, resolves OQ-2)

### Done
- chore(db): Render PostgreSQL → Supabase (PostgreSQL 17.6, Singapore) migration complete
- feat(db): `schema.sql` — add `CREATE EXTENSION IF NOT EXISTS vector` (prepares for v0.2 RAG)
- fix(backend): `connection.py` — parse `sslmode=require` from DSN + auto-set asyncpg `ssl='require'`
- fix(deploy): Render deploy failure (`OSError: [Errno 101] Network is unreachable`) → resolved with Session Mode Pooler URL

### Decisions
- **Session Mode Pooler (5432)**: Supabase direct connection (`db.xxx.supabase.co`) is IPv6-only — Render free tier and macOS both only support IPv4. Standardized on Session Mode Pooler (`pooler.supabase.com:5432`)
- **asyncpg + Session Pooler compatibility**: Transaction Pooler (6543) is incompatible with named prepared statements → must use Session Pooler (5432)
- **sslmode handling**: asyncpg ignores `sslmode` parameter in DSN → strip from URL and pass `ssl='require'` as kwarg

### Issues
- Supabase direct connection URL (`db.xxx.supabase.co`) IPv6 only — failed on both Render and macOS
- Resolution: Used "Not IPv4 compatible → Use Session Pooler" button in Supabase dashboard to get Pooler URL

---

## Session: 2026-02-27 (2nd)

> **Context**: UX stabilization + stream persistence improvements

### Done
- fix(frontend): Unify session cookie name `session_id` → `lingua_session` (3 proxy locations: chat/conversations/messages)
- feat(frontend): Restructure onboarding routing (`/` level select → `/setup` → `/chat?unit=&level=`)
- feat(frontend): Returning user auto-redirect to `/chat` based on localStorage
- feat(frontend): `useChat` generationRef — orphan stream handling on unit switch (drain without abort → guarantees DB save)
- feat(frontend): Persistent ChatPanel (`display:none`) — preserve stream/state on unit switch, resume real-time streaming on return
- feat(frontend): Sidebar drag-to-resize (160px~480px, mousedown/move/up, select-none during drag)
- fix(frontend): Remove sidebar Q&A badge
- fix(backend): `MAX_TOKENS` 1024 → 2048 (prevents truncation of long grammar explanations, resolves OQ-4)
- fix(frontend): Improve truncation message ("ask shorter" → "ask in smaller, more specific parts")
- feat(frontend): Answer copy button — copy icon on hover, 1.5s "Copied" feedback (user + assistant messages)

### Decisions
- **Persistent Panel strategy**: `display:none` is simpler and more effective than a stream registry at the useChat level. Preserves both React state and in-flight fetch
- **generationRef**: display:none solves the primary issue, but useChat's own orphan drain logic is kept as a safety net
- **max_tokens 2048**: Sufficient for comprehensive grammar unit explanations with claude-sonnet-4-6. Shows correct guidance on truncation
