# LinguaRAG - Wrap Up

> **Project**: `/Users/jaykim/Documents/Projects/lingua-rag`
> **Scope**: Full stack (backend + frontend + infra)
> **Live**: https://lingua-rag.vercel.app

## Session: 2026-03-12 23:16

> **Context**: PDF 관리 UX 버그 수정 — 인덱싱 상태 폴링, 중복 key, 삭제 cascade, 검색 하이라이트, 대용량 업로드

### Done
- fix(frontend): **폴링 재시작 버그** — `useRef` + `[]` deps 패턴을 derived `pollingNeeded` state로 교체, 업로드 후 인덱싱 상태가 자동 갱신
- fix(frontend): **React duplicate key 에러** — 사이드바 + 모달 `key={meta.name}` → `key={meta.chatId ?? meta.name}`
- fix(frontend): **동일 파일명 PDF 다중 선택 표시** — `activePdfName` 비교를 `activeChatId` 기반으로 전환 (사이드바 하이라이트)
- fix(frontend): **모달 업로드 후 사이드바 미반영** — 모달 업로드 경로에 `setPdfLibrary()` 즉시 호출 추가
- fix(frontend): **인덱싱 중 새 PDF 추가 시 목록 미반영** — 폴링 콜백에서 `getLibraryMeta()` re-read로 새 엔트리 반영
- fix(frontend): **새로고침 시 랜딩 페이지 깜빡임** — `initialized` false일 때 로딩 스피너 표시
- fix(frontend): **활성 PDF 삭제 시 첫 번째 PDF 자동 선택** — `handleDeletePdf`에서 `handleSelectPdf(sorted[0])` 호출
- fix(frontend): **대용량 PDF 업로드 실패 (10MB 제한)** — middleware matcher에서 `api/` 경로 제외
- fix(backend): **PDF 삭제 시 연관 데이터 미삭제** — `pdf_repo.delete()`에서 트랜잭션 내 `document_chunks`, `summaries`, `notes`, `conversations` 일괄 삭제
- feat(backend): **임베딩 API 재시도** — `embed_batch`에 exponential backoff (최대 3회, 500 에러)
- feat(backend): **임베딩 배치 실패 스킵** — 실패 배치만 제외하고 나머지 청크 정상 인덱싱
- feat(frontend): **PDF 검색 결과 클릭 시 모달 유지** — 페이지 이동만 수행, mouseLeave로 닫힘
- feat(frontend): **PDF 검색어 페이지 내 하이라이트** — `customTextRenderer`로 검색어 노란색 mark 표시

### Issues
- 특정 PDF (`_OceanofPDF.com_Hands-On_Large_Language_Models_-_Jay_Alammar.pdf`) 임베딩 시 OpenAI 500 에러 반복 발생 — 재시도 + 배치 스킵으로 부분 인덱싱 가능하나, 근본 원인 (깨진 텍스트? 과대 토큰?) 미확인

### Next
- [ ] OpenAI 500 반복 실패 PDF 원인 조사 — 실패 배치의 텍스트 내용 로깅하여 문제 청크 특정
- [ ] `activePdfName` → `activeChatId` 전면 리팩터링 — 현재 사이드바만 적용, `visitedPdfs`/`pdfIdMap` 등 나머지도 chatId 기반 전환
- [ ] Phase 4: user acquisition (10-20 users) — Reddit r/languagelearning, Discord communities
- [ ] Portfolio documentation: architecture diagram, ADR records, quantitative results

---

## Session: 2026-03-12 23:13

> **Context**: Phase 4-5 completion — Eval rebuild, CI/CD, Hybrid Search, Observability, TTS auto-detect, embedding model comparison

### Done
- feat(eval): **universal LLM-as-Judge evaluator** (`scripts/evaluate.py`) — 8 rules (5 content + 3 format), RAG keyword recall metric, 12 multi-language test questions (DE×5, EN×2, JA×2, ZH×1, FR×1, ES×1), `--language` filter, `--concurrency` flag
- feat(eval): **test_questions.json rewritten** — multi-language test set with 4 RAG context questions and `expected_in_response` ground truth keywords
- ci: **GitHub Actions CI/CD** — `ci.yml` (PR/push: backend lint + test + frontend lint + typecheck + build), `eval.yml` (workflow_dispatch: manual LLM eval + artifact upload)
- chore: **pyproject.toml** — ruff config (line-length 120, E/F/W/I rules, ignore E702); 9 backend files reformatted
- feat(rag): **Hybrid Search** (`repositories.py`) — pgvector cosine + PostgreSQL tsvector with Reciprocal Rank Fusion (RRF, k=60); single SQL with 3 CTEs; graceful fallback to vector-only
- feat(db): **004_hybrid_search.sql** — `tsv tsvector` column + GIN index on `document_chunks`
- feat(rag): **indexing_service.py** — `to_tsvector('simple', content)` during indexing for hybrid search support
- feat(api): **GET /api/stats** (`stats.py`) — token usage, RAG hit rate, cost estimates (Claude + OpenAI embedding), daily usage (14d), per-PDF breakdown (top 10)
- feat(api): **stats router registered** in `main.py`
- feat(indexing): **language auto-detect** (`language_detect.py`) — Unicode script analysis (hiragana/katakana/CJK) + function-word frequency matching (6 Latin languages); auto-sets `pdf_files.language` during indexing if not already set by user
- docs(embedding): **embedding model comparison** — `docs/embedding-comparison.md` (spec/cost/infra/multilingual analysis with decision matrix) + `scripts/compare_embeddings.py` (Hit@K, MRR, cosine separation benchmark via OpenAI + HuggingFace APIs)
- docs: **todo.md** — Phase 4 + Phase 5 all items marked complete

### Decisions
- Hybrid Search tokenizer: `'simple'` (language-agnostic whitespace tokenizer) over language-specific configs — service handles any language PDF
- RRF implementation: single SQL with CTEs + FULL OUTER JOIN (no application-level merging); candidate pool = `limit * 5` for better fusion quality
- Embedding model: **keep `text-embedding-3-small`** — cost <$1/mo vs $50+/mo for E5 self-host; Hybrid Search already compensates multilingual gap; migration cost (DB schema change + full re-index) not justified at current scale
- Language detection: pure stdlib (no `langdetect`/`fasttext` dependency) — simpler deployment, sufficient accuracy for PDF textbooks with dominant single-language content
- Stats API cost model: Claude output $15/M tokens + OpenAI embedding $0.02/M × 750 tokens/chunk average

### Next
- [ ] Phase 4: user acquisition (10-20 users) — Reddit r/languagelearning, Discord communities
- [ ] Run eval benchmark (`eval.yml` workflow_dispatch) and record actual scores for portfolio
- [ ] Commit pending frontend changes (guest mode, login modal, etc.) — currently excluded from Phase 5 commits
- [ ] Portfolio documentation: architecture diagram, ADR records, quantitative results
- [ ] Update `product-intro.md` with Hybrid Search and new Phase 5 features

---

## Session: 2026-03-11 23:33

> **Context**: Phase 1 pivot — remove all German-specific code, convert unit-based architecture to PDF-based universal language tutor

### Done
- refactor(backend): **prompts.py full rewrite** — removed `TUTOR_ROLE`, `LEVEL_CONFIG`, `UNIT_SUMMARY_TABLE`, `ANSWER_FORMAT`, `_build_constraints()`; new universal `build_system_prompt(language, learner_language, rag_chunks)` with prompt caching split (fixed prefix + dynamic RAG suffix)
- chore(backend): **units.py deleted** — removed 1,000+ lines of hardcoded German curriculum data (`DOKDOKDOK_A1`, `BAND_1~8`)
- refactor(backend): **schemas.py** — `ChatRequest`: removed `unit_id/level/textbook_id`, added `pdf_id`; `ConversationOut`: `unit_id/level` → `pdf_id/pdf_name`; `SummaryCreate/Out`, `NoteCreate/Out`: `unit_id/unit_title` → `pdf_id/pdf_name`
- refactor(backend): **claude_service.py** — removed `DOKDOKDOK_A1` import, calls universal `build_system_prompt_parts(language, rag_chunks)`
- refactor(backend): **chat.py** — conversation key `(user, unit_id)` → `(user, pdf_id)`, removed WORTLISTE vocabulary search, removed A1/A2/dokdokdok-a1 defaults, RAG search uses `pdf_id` filter, resolves language from `pdf_files.language`
- refactor(backend): **repositories.py** — `ConversationRepository.get_or_create()` uses `pdf_id`, removed `search_vocabulary()` (WORTLISTE-specific), `VectorSearchRepository.search()` uses `pdf_id` instead of `textbook_id`, `SummaryRepository`/`NoteRepository` switched to `pdf_id/pdf_name`
- refactor(backend): **summaries.py / notes.py routers** — query param `unit_id` → `pdf_id`, response mapping `unit_id/unit_title` → `pdf_id/pdf_name`
- test(backend): **test_prompts.py rewritten** — 16 tests covering tutor role, answer format, constraints, RAG injection, prompt caching split; all 16 pass
- refactor(backend): **config.py** — `RAG_ENABLED` default changed from `False` to `True` (RAG is now core, not optional)
- feat(db): **001_unit_to_pdf.sql migration** — adds `pdf_id`/`pdf_name` columns to conversations/summaries/notes/document_chunks, migrates existing data, drops old columns (`unit_id`, `textbook_id`, `level`, `unit_title`)
- fix(db): Added `ALTER COLUMN ... DROP NOT NULL` for old columns before DROP to fix `NotNullViolationError` on INSERT
- refactor(frontend): **types.ts** — removed `UNITS` array (56 hardcoded units), `SavedSummary`/`SavedNote` interfaces use `pdfId/pdfName`
- refactor(frontend): **useChat.ts** — removed `level` type, `UseChatOptions` simplified to `{pdfId, getPageText}`, API body sends `pdf_id`, `SUMMARY_PROMPT` language-agnostic ("단어와 표현" instead of "독일어 단어와 표현")
- refactor(frontend): **ChatPanel.tsx** — props `unitId/level/textbookId` → `pdfId/pdfName`, removed UNITS import, all summary/note calls use `pdfId/pdfName`
- refactor(frontend): **chat/page.tsx** — removed level state, `textbookId` derivation, `useSearchParams`, `pdfUnitIdMap` → `pdfIdMap` (no more `pdf:` prefix), removed "레벨 재선택" menu item
- refactor(frontend): **summaries.ts / notes.ts** — API calls use `pdf_id` query param
- refactor(frontend): **API routes (summaries, notes)** — proxy passes `pdf_id` instead of `unit_id`
- chore(frontend): **setup/page.tsx deleted** — obsolete unit selector page
- refactor(frontend): **page.tsx (landing)** — replaced German level selector with simple redirect to `/chat`
- docs: **README.md full rewrite** — updated for PDF-based architecture: new features section, architecture diagrams with `pdf_id`, DB schema with all current tables, updated user flow, project structure, API endpoints, design decisions
- docs: **todo.md updated** — Phase 1 all items checked, Phase 3 marked as completed (done in Phase 1)

### Decisions
- DB migration strategy: add new columns → migrate data → drop old columns (not rename) to avoid implicit dependencies
- Old German conversation data naturally orphaned (old `unit_id` values don't match new PDF UUIDs) — acceptable since it's a pivot
- Scripts cleanup (evaluate.py, index_wortliste.py) deferred to Phase 2/4 as planned — they don't affect running app
- `RAG_ENABLED` default flipped to `True` — RAG is now the product's core, not an optional enhancement

### Issues
- `NotNullViolationError` on `conversations.unit_id` after migration — migration added `pdf_id` but didn't drop NOT NULL on old columns; fixed by adding `ALTER COLUMN ... DROP NOT NULL` before DROP
- POST /api/chat 500 error resolved after running the NOT NULL fix + server restart

### Next
- [x] Phase 2: `POST /api/pdfs/{id}/index` endpoint — PDF upload → auto text extraction → chunking → embedding → `document_chunks` storage (completed in prior session)
- [x] Phase 2: `pdf_files.index_status` column (`pending → indexing → ready → failed`) (completed in prior session)
- [x] Phase 2: Indexing status UI in PDF sidebar (completed in prior session)
- [x] Phase 2: Chunking strategy (page-based, paragraph split for long pages) (completed in prior session)
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

---

## Session: 2026-03-11 19:04

> **Context**: Language selection UX fixes (no default language on new PDF) + sticky note Windows-style redesign

### Done
- fix(pdf): No default language for new PDFs — `fetchPdfLanguage` useEffect calls `onLanguageChange(null)` before fetching; PDFs with no saved language show amber "언어 선택" instead of inheriting global TTS language from localStorage
- fix(pdf): `onLanguageChange` prop type widened from `string` to `string | null` in `PdfViewerInner` interface (`useTTS.setLanguage` already accepted `null`)
- fix(pdf): Sound buttons in hover/drag popups open language modal when no language set — `if (!language) { setPendingLang(null); setShowLangModal(true); return; }` guard in both popup sound button onClick handlers
- fix(pdf): Language modal Save button disabled when no language selected (`disabled={!pendingLang && !language}`)
- feat(pdf): Sticky note UI redesigned to Windows Sticky Notes style — colored header bar (amber/pink/green/blue), pastel body background, color swatches in header, trash/close icon in header; borderless transparent textarea directly editable
- feat(pdf): `STICKY_COLORS` module-level constant — maps `yellow/pink/green/blue` to `{ header, body }` hex color pairs
- feat(pdf): ESC key on sticky note textarea — dismisses edit mode (`setEditingSticky(null)`) or creation mode (`setPendingSticky(null)`)

### Next
- [x] Run Supabase SQL migration (completed — `001_unit_to_pdf.sql` covers all schema changes)
- [x] Test end-to-end: upload PDF → appears in sidebar → send chat → refresh → PDF selected + chat visible — 수동 테스트 완료
- [x] Test annotation overlay — upload PDF to server, add sticky memo, verify DB persist, reload and confirm — 수동 테스트 완료
- [x] Test translation button — drag German text, click "번역", verify Korean result without popup closing — 수동 테스트 완료
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

---

## Session: 2026-03-11 19:03

> **Context**: Chat message action bars (Copy/👍/👎/Retry/Edit), inline message editing, Supabase message truncate API, pronunciation modal symbol/number normalization fixes

### Done
- feat(chat): `AssistantActionBar` component — Copy (with 복사됨 feedback), 👍, 👎, Retry buttons below AI messages; `opacity-0 group-hover:opacity-100`
- feat(chat): `UserActionBar` component — Retry, Edit, Copy buttons below user messages; `opacity-0 group-hover:opacity-100`
- feat(chat): Inline message editing — Edit button shows textarea in-place with Save/Cancel; `Cmd+Enter` shortcut; `Escape` cancels
- feat(chat): Shared icon atoms — `IconCopy`, `IconCheck`, `IconRetry`, `IconEdit`, `IconThumbUp`, `IconThumbDown`
- refactor(chat): Removed `CopyButton` (absolute top-right in bubble) and `FeedbackButtons` (standalone below bubble); replaced with unified action bars
- feat(chat): `retryFromMessage()` in `useChat.ts` — reads current messages via `messagesRef` (not state), removes from target message onward, returns content for resend; AI message retry removes preceding user message too
- feat(chat): `messagesRef` — `useRef` synced to `messages` each render, enables synchronous read inside `retryFromMessage` without stale closure
- feat(backend): `DELETE /api/messages/{id}/truncate` endpoint — deletes target message + all subsequent in same conversation; ownership verified via `user_id`
- feat(backend): `MessageRepository.delete_from()` — SQL DELETE with `created_at >=` pivot + conversation ownership join
- feat(frontend): Next.js proxy route `app/api/messages/[id]/truncate/route.ts`
- feat(chat): Fire-and-forget Supabase truncate on Retry/Edit — `fetch(truncate)` with `.catch(() => {})` so DB cleanup doesn't block UX
- fix(chat): `retryFromMessage` stale closure bug — was setting `contentToResend` inside `setMessages` updater (runs asynchronously); fixed by reading `messagesRef.current` synchronously before `setMessages`
- fix(pdf/chat): `€`/`%`/`$`/`£`/`¥` symbol expansion in `normalize()` before stripping non-letters — fixes "1€" not matching "euro" in pronunciation practice
- fix(chat): Number normalization — digits kept in `normalize()` regex; `NUMBER_WORDS` lookup table per language; `numericMatch()` for digit↔word comparison ("20" ↔ "zwanzig")
- fix(chat): User message bubble `wrap-break-word` — long unbroken strings no longer overflow bubble boundary

### Decisions
- **`messagesRef` pattern over state in callbacks**: `setMessages` updater is scheduled async in React 18; to compute return values synchronously from `retryFromMessage`, a ref mirroring `messages` is the idiomatic solution.
- **Fire-and-forget truncate**: DB cleanup is non-critical — UI updates instantly; if truncate fails, the orphaned messages in DB are invisible (history loads only up to current conversation state in next session).
- **Inline edit → immediate sendMessage**: On Edit save, `retryFromMessage` removes messages then `sendMessage(newContent)` fires directly, not via inject-to-input. Cleaner UX matching Claude's behavior.

### Issues
- **`w-full` flex overflow on edit textarea**: `w-full` inside `flex justify-end` expanded beyond viewport. Fixed with `w-[min(80%,100%)] min-w-0 ml-auto`.

### Next
- [x] Run Supabase SQL migration — 완료
- [x] Test end-to-end: upload PDF → sidebar → chat → refresh — 수동 테스트 완료
- [x] Test annotation overlay — 수동 테스트 완료
- [x] Test translation button — 수동 테스트 완료
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Wire `onRetry` for assistant messages — MessageList.tsx에 완전 연결 완료
- [ ] Consider adding `NUMBER_WORDS` support for Japanese/Chinese (currently only de/en/fr/es/it/pt)

---

## Session: 2026-03-11 01:36

> **Context**: PDF viewer multi-page scrolling, per-PDF language + last-page persistence in Supabase, loading overlay, PDF switch freeze fix, lastSavedPage optimization, scroll animation hiding

### Done
- feat(pdf): Multi-page vertical scroll — all pages rendered in scrollable column; windowed rendering (±3 pages) with placeholder divs to prevent freeze
- feat(pdf): `IntersectionObserver` — tracks most-visible page in scroll area; updates `pageNumber` state
- fix(pdf): PDF switch freeze — `key={file.name}` on `<Document>` forces remount + cancels old render; windowed rendering limits concurrent canvas count
- feat(pdf): Per-PDF language saved to Supabase `pdf_files.language` — auto-loaded on PDF open, applied to TTS + PronunciationModal
- feat(pdf): Multi-language TTS — `useTTS` refactored from German-only to 9-language; `TTS_LANGUAGES` constant; `language: null` state means not selected; `speak()` no-ops if language null
- feat(pdf): Language selector in PDF viewer header — amber button when not selected; modal with 9-language grid, X button, Save button, no outside-click-close; `pendingLang` staging state
- feat(pdf): Per-PDF last-page saved to Supabase `pdf_files.last_page` — auto-saved on page change (1.5s debounce); restored on PDF reopen
- feat(pdf): Loading overlay — spinner shown until page restore complete; prevents page-1 flicker before scrolling to saved page
- fix(pdf): `lastSavedPageRef` — tracks server-confirmed last page; skips PATCH `/last-page` if `pageNumber` unchanged
- fix(pdf): Scroll hidden during restore — `scrollToPage(page, true)` uses `behavior: "instant"`; page navigation buttons keep `"auto"`
- fix(pdf): IntersectionObserver blocked during loading — `pdfReadyRef` synced from `pdfReady` state; observer skips `setPageNumber` while `!pdfReadyRef.current`; prevents toolbar showing 39→40 during restore
- feat(backend): `GET/PATCH /pdfs/{id}/language` endpoints in `pdfs.py`
- feat(backend): `GET/PATCH /pdfs/{id}/last-page` endpoints in `pdfs.py`
- feat(backend): `PdfFileRepository.update_language`, `update_last_page` methods
- feat(frontend): Next.js proxy routes — `app/api/pdfs/[id]/language/route.ts`, `app/api/pdfs/[id]/last-page/route.ts`
- feat(frontend): `lib/annotations.ts` — added `fetchPdfLanguage`, `savePdfLanguage`, `fetchLastPage`, `saveLastPage`

### Decisions
- **Windowed rendering ±3**: Rendering all pages simultaneously caused browser freeze on PDF switch. ±3 window balances scroll smoothness vs. memory.
- **`key={file.name}` on `<Document>`**: Forces react-pdf to fully unmount/remount on PDF change, cancelling in-flight canvas renders cleanly.
- **`pdfReadyRef` instead of `pdfReady` in observer**: IntersectionObserver callbacks are async; reading `pdfReady` state directly gives stale closure. Ref stays current without re-subscribing the observer.
- **`behavior: "instant"` only for restore**: Page navigation buttons keep default scroll behavior; instant only used during initial page restore to avoid visible scroll animation under the overlay.

### Issues
- **Overlay didn't hide scroll jump**: Overlay covered PDF area but toolbar (outside scroll area) showed page number changing (39→40). Fixed by gating IntersectionObserver on `pdfReadyRef`.

### Next
- [x] Run Supabase SQL migration: `ALTER TABLE pdf_files ADD COLUMN language TEXT; ADD COLUMN last_page INTEGER` — 완료
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 아키텍처 마이그레이션에서 제거됨
- [x] Fix hover useEffect dependency — hover 관련 코드가 마이그레이션에서 제거되어 해당 없음
- [x] Hover popup edge positioning — `popup.y < 80` 시 아래쪽 표시 fallback 추가
- [x] Test end-to-end: upload PDF → sidebar → chat → refresh — 수동 테스트 완료
- [x] Test annotation overlay — 수동 테스트 완료
- [x] Test translation button — 수동 테스트 완료

---

## Session: 2026-03-11 01:14

> **Context**: Sticky memo annotation overlay + PDF text selection popup translation + multi-page drag fix + TTS popup persistence + chat error DB save

### Done
- feat(pdf): Annotation overlay in `PdfViewer.tsx` — 📌 pins positioned by `x_pct`/`y_pct`, edit popover, pending sticky form on page click
- feat(pdf): `useImperativeHandle` expose `getPdfId: () => serverId` for parent access
- feat(pdf): Annotation load `useEffect` — `fetchAnnotations(serverId)` on `serverId` change; all annotations fetched at once, filtered client-side per page
- feat(pdf): Sticky memo toolbar button (visible only when `serverId` is set)
- refactor(pdf): Rename note → sticky — `isNoteMode` → `isStickyMode`, `pendingNote` → `pendingSticky`, `editingNote` → `editingSticky`, etc.
- feat(pdf): "번역" button in inline selection popup — MyMemory API (`de|ko`); result row below buttons; `onMouseLeave` suppressed during fetch and while result is shown
- fix(pdf): Popup centered on mouse X — `left: popup.x, transform: "translateX(-50%)"` replacing right-align
- fix(pdf): Multi-page drag/selection broken after multi-page render refactor — `findTextLayer(node)` helper using `querySelectorAll(".react-pdf__Page__textContent")` + containment check; applied across all 6+ call sites (`handleMouseDown`, `handleMouseMoveDrag`, `handleMouseUp`, `handleDblClick`, hover handler, `computeRangeRects`)
- fix(pdf): TTS popup stays open while speaking — `onMouseLeave` checks `window.speechSynthesis.speaking`; popup persists until audio ends then closes on next mouse-out
- fix(layout): `suppressHydrationWarning` on `<body>` — resolves browser extension `cz-shortcut-listen` attribute hydration mismatch
- fix(chat): Save Claude error messages to DB — `event["type"] == "error"` branch calls `msg_repo.create()` before SSE yield; `except Exception` handler also saves generic error message with nested try/except protecting SSE delivery
- feat(backend): `AnnotationRepository` — `list_by_page`, `list_all`, `create`, `update`, `delete` in `repositories.py`
- feat(backend): Annotation CRUD endpoints in `pdfs.py` — `GET/POST /{pdf_id}/annotations`, `PATCH/DELETE /{pdf_id}/annotations/{ann_id}`; `list_annotations` optional `page_num` query param
- feat(frontend): `frontend/lib/annotations.ts` — `fetchAnnotations`, `createAnnotation`, `updateAnnotation`, `deleteAnnotation`
- feat(frontend): Next.js proxy routes — `app/api/pdfs/[id]/annotations/route.ts` (GET + POST), `[id]/annotations/[annId]/route.ts` (PATCH + DELETE)

### Decisions
- **`findTextLayer` over `querySelector`**: Multi-page render (`Array.from({length:numPages}).map(n => <Page>)`) renders all pages simultaneously. `querySelector` returns only the first text layer. Fix: `querySelectorAll` + `Array.from().find(l => l.contains(node))` pinpoints the correct layer per event target.
- **`window.speechSynthesis.speaking` check**: TTS `isSpeaking` state lives in `useTTS` hook. Rather than threading the prop down, read the browser API directly in `onMouseLeave` — zero prop interface changes.
- **Single PDF-level annotation fetch**: Fetch all annotations once on `serverId` change, filter per-page client-side. Avoids N per-page requests on page navigation.

### Issues
- **TypeScript `textLayer` undefined after refactor**: `handleMouseMoveDrag` referenced `textLayer` variable after inline refactor removed it — fixed by re-adding `const textLayer = findTextLayer(startCaret.startContainer)`
- **`onMouseLeave` closing popup during translation**: Async `fetch` in translate handler was racing with `onMouseLeave` — fixed by adding `isTranslating` state + checking it in `onMouseLeave`

### Next
- [x] Test end-to-end: upload PDF → sidebar → chat → refresh — 수동 테스트 완료
- [x] Test annotation overlay — 수동 테스트 완료
- [x] Test translation button — 수동 테스트 완료
- [x] Fix hover useEffect dependency — hover 시스템 Phase 1에서 제거됨
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Hover popup edge positioning — selection popup에 적용 완료
- [x] `@react-pdf-viewer/core` 마이그레이션 검토 → 불필요 (동일 pdfjs-dist 기반, 커스텀 선택 충돌, 7개월 무업데이트)

---

## Session: 2026-03-11 01:13

> **Context**: Supabase Storage migration (local filesystem → cloud), PDF metadata DB table, chat persistence fix (unitId drift + refresh state restore), annotation batch fetch

### Done
- feat(backend): `app/core/storage.py` — new async Supabase Storage client (httpx); `storage_upload`, `storage_download`, `storage_signed_url`, `storage_delete`; bucket `pdfs`, path `{user_id}/{pdf_id}.pdf`
- feat(backend): `SUPABASE_SERVICE_ROLE_KEY` field added to `Settings` class in `config.py`
- feat(backend): `PdfFileRepository` added to `repositories.py` — `create`, `list_by_user`, `get`, `delete` against `pdf_files` DB table
- feat(backend): `AnnotationRepository.list_all()` — fetch all annotations for a PDF without `page_num` filter (ordered by page_num, created_at ASC)
- refactor(backend): `pdfs.py` — full rewrite; filesystem replaced with Supabase Storage; metadata moved from JSON sidecars to `pdf_files` table; `serve_pdf` returns 302 redirect to signed URL; `GET /pdfs/{id}/page/{n}/image` and `/text` download from Storage then process with PyMuPDF
- feat(backend): `GET /pdfs/{id}/annotations` — `page_num` query param now optional; omit to return all annotations
- chore(backend): `requirements.txt` — added `PyMuPDF>=1.24.0`
- fix(frontend): `annotations.ts` — `fetchAnnotations(pdfId)` no longer takes `pageNum`; fetches all annotations in one request
- fix(frontend): `PdfViewer.tsx` — replaced `Promise.all(Array(numPages)…)` (N requests per page) with single `useEffect` on `serverId` change; batch fetch all annotations at once
- fix(frontend): `pdfLibrary.ts` — `getLibraryMeta()` was stripping `serverId` field in `.map()`; fixed by spreading `serverId` conditionally; added `seen` Set deduplication to prevent duplicate entries
- feat(frontend): `page.tsx` — `pdfUnitIdMap = useRef<Map<string,string>>` locks unitId at first visit to prevent mid-session drift when `pdfLibrary` state updates after server fetch
- feat(frontend): `page.tsx` — init `useEffect` restores `activePdfName`, `visitedPdfs`, `pdfUnitIdMap` from `LIBRARY_CURRENT_KEY` so PDF selection persists across refresh
- fix(frontend): `page.tsx` — after upload completes, `pdfUnitIdMap.current.set(name, "pdf:{uuid}")` so current session uses stable uuid-based key (not temporary `pdf:{filename}` key)
- fix(db): `ALTER TABLE conversations ALTER COLUMN unit_id TYPE TEXT` — was `VARCHAR(10)`, too short for `pdf:{uuid}` (40 chars)
- chore(db): `pdf_files` table created in Supabase with `id TEXT PRIMARY KEY`, `user_id UUID`, `name TEXT`, `size BIGINT`, `total_pages INTEGER`, `created_at TIMESTAMPTZ`

### Decisions
- **Supabase Storage over S3/R2**: Project already uses Supabase for auth + DB; using Supabase Storage avoids adding a new vendor. Service role key bypasses RLS for server-side operations. No SDK dependency needed — direct httpx calls to Storage REST API.
- **Signed URL redirect (302) over streaming**: `serve_pdf` creates a 1-hour signed URL and returns a redirect. Avoids proxying PDF bytes through the backend; browser fetches directly from Supabase CDN.
- **`pdfUnitIdMap` ref over derived state**: unitId computed from `pdfLibrary` state caused drift when async server sync updated `serverId` mid-session. Ref locked at first visit is immune to state updates.
- **Batch annotation fetch**: One `GET /pdfs/{id}/annotations` call vs. N calls (one per page). Backend returns all annotations sorted by page; frontend filters client-side when needed.

### Issues
- **`ValidationError: SUPABASE_SERVICE_ROLE_KEY Extra inputs not permitted`**: `storage.py` initially used `os.environ` directly instead of pydantic `settings`, then key was not declared in `Settings` class → fixed both
- **`StringDataRightTruncationError VARCHAR(10)`**: `conversations.unit_id` was `VARCHAR(10)`; new format `pdf:{uuid}` = 40 chars → required `ALTER TABLE` migration
- **`zsh: 1.24.0 not found` on pip install**: Shell misinterpreted `>=` as redirect. Correct: `pip install "PyMuPDF>=1.24.0"` (quoted)
- **Old chat history orphaned**: Conversations stored under old `unitId` format (before this session) cannot be recovered as keys have changed. Users should re-upload PDFs for clean state.

### Next
- [x] Test end-to-end: upload PDF → sidebar → chat → refresh — 수동 테스트 완료
- [x] Clean up `backend/uploads/` directory — 디렉토리 자체 없음 (완료)
- [x] Fix hover useEffect dependency — hover 시스템 Phase 1에서 제거됨
- [x] Fix double-click word selection — `handleDblClick` 구현 완료
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

---

## Session: 2026-03-10 22:54

> **Context**: PDF viewer UX fixes (scroll animation, floating toolbar) + page image → "이 페이지" trigger-based text extraction refactor

### Done
- fix(pdf): Remove smooth scroll animation — `scrollIntoView({ behavior: "smooth" })` → `"instant"` + `ignoreScrollRef` timeout reduced to 100ms
- fix(pdf): Fix bottom toolbar scrolling away — restructured DOM: `relative` on outer container, removed `relative` from scroll div, moved toolbar + search panel JSX outside the scrollable `div` (sibling of scrollRef, child of containerRef)
- feat(pdf): `PdfViewerHandle` interface + `forwardRef` — expose `getPageText()` (pdfjs `getTextContent()`) and `hasFile()` via imperative ref; parent can extract page text client-side on demand
- refactor(pdf): Remove auto canvas image capture — deleted `onRenderSuccess` → `canvas.toDataURL` → `onPageImageChange` block; replaced with lightweight `onPageChange?.(pageNumber)` callback
- refactor(pdf): `onPageImageChange` prop → `onPageChange` prop (client-side, page number only; no base64 data)
- feat(backend): `GET /api/pdfs/{pdf_id}/page/{page_num}/text` — PyMuPDF `get_text()` endpoint in `pdfs.py`
- feat(backend): Register pdfs router in `main.py` (`app.include_router(pdfs.router, ...)`)
- feat(backend): `page_text: Optional[str]` field added to `ChatRequest` schema
- feat(backend): `_build_messages` updated — `page_text` injects `[현재 PDF 페이지 내용]\n{text}` prefix before user message (text path, not image path)
- feat(backend): `chat.py` — pass `page_text=body.page_text` to `claude_svc.stream()`
- feat(frontend): `GET /api/pdfs/[id]/page/[pageNum]/text/route.ts` — Next.js proxy route (auth-forwarded)
- feat(chat): `useChat` — detect `"이 페이지"` regex trigger in user message → call `getPageText()` callback → send as `page_text` in POST body
- refactor(chat): Replace `pageImage` prop chain with `getPageText` callback (page.tsx → ChatPanel → useChat)
- feat(ux): InputBar context indicator — "페이지 컨텍스트 활성" → "PDF 연결됨" + updated tooltip explaining the trigger

### Decisions
- **Client-side text extraction over server-side**: PdfViewer already has pdfjs doc loaded in memory via `pdfDocRef`. Using `getTextContent()` client-side avoids server round-trip and doesn't require the server-stored PDF (current architecture uses IndexedDB/local storage). Server endpoint (`/pdfs/{id}/text`) is ready for when server-stored PDFs are needed.
- **Trigger-based injection over auto-send**: Sending page image on every page turn was expensive (vision tokens per render). Trigger on `"이 페이지"` is zero-cost until the user explicitly references the page, and text extraction is cheaper than image tokens.
- **`forwardRef` for imperative text access**: Parent (page.tsx) needs to call `getPageText()` imperiously without owning the pdfjs state. `forwardRef` + `useImperativeHandle` is the correct React pattern here over lifting pdfjs state up.

### Issues
- **Edit tool permission rejections (multiple)**: VSCode extension kept prompting for permission; required user approval each time. Caused re-reads between attempts due to cache expiration.

### Next
- [ ] Fix hover useEffect dependency: `[]` → `[file]` so listener attaches after PDF loads
- [ ] Fix double-click word selection — `handleDblClick` with `findCaretAt` + `wordBoundaries`
- [ ] Test "이 페이지" trigger end-to-end — open a PDF, ask "이 페이지에 있는 단어 설명해줘", verify `page_text` logged in backend
- [ ] Remove debug `console.log` from `PdfViewer.tsx` (`[extract]`, `[columns]`, `[sentence]`)
- [ ] Hover popup edge positioning — viewport top overflow fallback
- [x] `@react-pdf-viewer/core` 마이그레이션 검토 → 불필요 (동일 pdfjs-dist 기반, 커스텀 선택 충돌, 7개월 무업데이트)

---

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
- [x] Fix hover useEffect dependency — hover 시스템 Phase 1에서 제거됨
- [x] Fix double-click word selection — `handleDblClick` 구현 완료
- [x] `@react-pdf-viewer/core` 마이그레이션 검토 → 불필요 (동일 pdfjs-dist 기반, 커스텀 선택 충돌, 7개월 무업데이트)
- [x] Restart backend server to apply RAG changes — Phase 1 마이그레이션에서 처리됨
- [x] Test WORTLISTE RAG — OBSOLETE: WORTLISTE 검색 Phase 1에서 제거됨
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

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
- [x] Verify `extractSpeakerPrefix` fix — MessageList.tsx에서 정상 동작 확인
- [x] Remove debug `console.log` from `PdfViewer.tsx` — 제거 완료
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
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료
- [x] Run notes table migration — schema.sql에 정의 완료

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
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료
- [x] Run notes table migration — schema.sql에 정의 완료
- [x] Verify `Connection: close` fix — chat.py에 헤더 적용 완료
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
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료
- [x] Run notes table migration — schema.sql에 정의 완료
- [x] Verify `Connection: close` fix — chat.py에 헤더 적용 완료

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
- [x] Run notes table migration — schema.sql에 정의 완료
- [x] Verify `Connection: close` fix — chat.py에 헤더 적용 완료
- [x] Apply Prompt Caching — 완료
- [x] Plan v0.3 kickoff — 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

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
- [x] Verify `UND_ERR_SOCKET` fix — `Connection: close` 헤더 적용 완료
- [x] Apply Prompt Caching — 완료
- [x] Plan v0.3 kickoff — 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

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
- [x] Redeploy backend — 배포 완료
- [x] Plan v0.3 kickoff — 완료
- [ ] Design progress tracking UX (how to handle completed units)
- [x] Evaluate STT — Web Speech API 채택, PronunciationModal 구현 완료

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
- [x] Plan v0.3 kickoff — 완료
- [ ] Design progress tracking UX (how to handle completed units)
- [x] Evaluate STT — Web Speech API 채택, PronunciationModal 구현 완료

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
- [x] Plan v0.3 kickoff — 완료
- [ ] Design progress tracking UX (how to handle completed units)
- [x] Evaluate STT — Web Speech API 채택, PronunciationModal 구현 완료
- [x] Hover popup edge positioning — `popup.y < 80` fallback 적용 완료

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
- [x] Improve chunk quality — OBSOLETE: index 스크립트 Phase 1에서 삭제됨
- [x] Verify unit detection — OBSOLETE: unit 시스템 Phase 1에서 제거됨
- [x] Plan v0.3 kickoff — 완료

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
