import { SavedSummary } from "./types";

// ---------------------------------------------------------------------------
// API helpers — summaries are stored in Supabase via the backend API.
// ---------------------------------------------------------------------------

function mapSummary(s: {
  id: string;
  unit_id: string;
  unit_title: string;
  content: string;
  saved_at: string;
}): SavedSummary {
  return {
    id: s.id,
    unitId: s.unit_id,
    unitTitle: s.unit_title,
    content: s.content,
    savedAt: s.saved_at,
  };
}

export async function getSummaries(unitId: string): Promise<SavedSummary[]> {
  try {
    const res = await fetch(
      `/api/summaries?unit_id=${encodeURIComponent(unitId)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.summaries ?? []).map(mapSummary);
  } catch {
    return [];
  }
}

export async function saveSummary(
  summary: Omit<SavedSummary, "id" | "savedAt">
): Promise<SavedSummary> {
  const res = await fetch("/api/summaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unit_id: summary.unitId,
      unit_title: summary.unitTitle,
      content: summary.content,
    }),
  });
  if (!res.ok) throw new Error(`Failed to save summary: ${res.status}`);
  const data = await res.json();
  return mapSummary(data);
}

export async function deleteSummary(id: string): Promise<void> {
  await fetch(`/api/summaries/${id}`, { method: "DELETE" });
}

export function formatSavedAt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}
