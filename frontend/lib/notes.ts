import { SavedNote } from "./types";

function mapNote(n: {
  id: string;
  pdf_id: string;
  pdf_name: string;
  content: string;
  saved_at: string;
}): SavedNote {
  return {
    id: n.id,
    pdfId: n.pdf_id,
    pdfName: n.pdf_name,
    content: n.content,
    savedAt: n.saved_at,
  };
}

export async function getNotes(pdfId: string): Promise<SavedNote[]> {
  try {
    const res = await fetch(`/api/notes?pdf_id=${encodeURIComponent(pdfId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.notes ?? []).map(mapNote);
  } catch {
    return [];
  }
}

export async function saveNote(
  note: Omit<SavedNote, "id" | "savedAt">
): Promise<SavedNote> {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdf_id: note.pdfId,
      pdf_name: note.pdfName,
      content: note.content,
    }),
  });
  if (!res.ok) throw new Error(`Failed to save note: ${res.status}`);
  const data = await res.json();
  return mapNote(data);
}

export async function deleteNote(id: string): Promise<void> {
  await fetch(`/api/notes/${id}`, { method: "DELETE" });
}
