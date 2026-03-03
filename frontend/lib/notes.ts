import { SavedNote } from "./types";

function mapNote(n: {
  id: string;
  unit_id: string;
  unit_title: string;
  content: string;
  saved_at: string;
}): SavedNote {
  return {
    id: n.id,
    unitId: n.unit_id,
    unitTitle: n.unit_title,
    content: n.content,
    savedAt: n.saved_at,
  };
}

export async function getNotes(unitId: string): Promise<SavedNote[]> {
  try {
    const res = await fetch(`/api/notes?unit_id=${encodeURIComponent(unitId)}`);
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
      unit_id: note.unitId,
      unit_title: note.unitTitle,
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
