// PDF annotation helpers — CRUD via server API

export interface Annotation {
  id: string;
  pdf_id: string;
  page_num: number;
  x_pct: number;
  y_pct: number;
  text: string;
  color: string;
  created_at: string;
}

export async function fetchAnnotations(pdfId: string, pageNum: number): Promise<Annotation[]> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations?page_num=${pageNum}`);
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
): Promise<Annotation | null> {
  const res = await fetch(`/api/pdfs/${pdfId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_num: pageNum, x_pct: xPct, y_pct: yPct, text, color }),
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
