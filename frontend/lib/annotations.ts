// PDF annotation helpers — CRUD via server API

export interface Annotation {
  id: string;
  pdf_id: string;
  page_num: number;
  x_pct: number;
  y_pct: number;
  text: string;
  color: string;
  type: "sticky" | "highlight";
  highlighted_text: string | null;
  created_at: string;
}

export async function fetchAnnotations(pdfId: string): Promise<Annotation[]> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations`);
  if (!res.ok) return [];
  return res.json();
}

export async function createAnnotation(
  pdfId: string,
  pageNum: number,
  xPct: number,
  yPct: number,
  text: string,
  color: string,
  type: "sticky" | "highlight" = "sticky",
  highlightedText?: string,
): Promise<Annotation | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_num: pageNum, x_pct: xPct, y_pct: yPct, text, color,
      type, highlighted_text: highlightedText ?? null,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateAnnotation(
  pdfId: string,
  annId: string,
  text: string,
  color: string,
): Promise<Annotation | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations/${annId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, color }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteAnnotation(pdfId: string, annId: string): Promise<boolean> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations/${annId}`, { method: "DELETE" });
  return res.ok;
}

export async function moveAnnotation(
  pdfId: string,
  annId: string,
  xPct: number,
  yPct: number,
): Promise<boolean> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations/${annId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x_pct: xPct, y_pct: yPct }),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export interface VocabEntry {
  id: string;
  pdf_id: string;
  page_num: number;
  word: string;
  context: string | null;
  meaning: string | null;
  language: string | null;
  created_at: string;
}

export async function fetchVocabulary(pdfId: string): Promise<VocabEntry[]> {
  const res = await fetch(`/api/pdfs/${pdfId}/vocabulary`);
  if (!res.ok) return [];
  return res.json();
}

export async function createVocabulary(
  pdfId: string,
  pageNum: number,
  word: string,
  context?: string | null,
  meaning?: string | null,
  language?: string | null,
): Promise<VocabEntry | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/vocabulary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_num: pageNum, word, context, meaning, language }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateVocabulary(
  pdfId: string,
  vocabId: string,
  word?: string,
  meaning?: string,
): Promise<VocabEntry | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/vocabulary/${vocabId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, meaning }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteVocabulary(pdfId: string, vocabId: string): Promise<boolean> {
  const res = await fetch(`/api/pdfs/${pdfId}/vocabulary/${vocabId}`, { method: "DELETE" });
  return res.ok;
}

// ---------------------------------------------------------------------------
// PDF language
// ---------------------------------------------------------------------------

export async function fetchPdfLanguage(pdfId: string): Promise<string | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/language`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.language ?? null;
}

export async function savePdfLanguage(pdfId: string, language: string | null): Promise<void> {
  await fetch(`/api/pdfs/${pdfId}/language`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  });
}

// ---------------------------------------------------------------------------
// PDF last page
// ---------------------------------------------------------------------------

export async function fetchLastPage(pdfId: string): Promise<number> {
  const res = await fetch(`/api/pdfs/${pdfId}/last-page`);
  if (!res.ok) return 1;
  const data = await res.json();
  return data.last_page ?? 1;
}

export async function saveLastPage(pdfId: string, page: number): Promise<void> {
  await fetch(`/api/pdfs/${pdfId}/last-page`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ last_page: page }),
  });
}
