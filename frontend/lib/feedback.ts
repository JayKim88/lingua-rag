export async function patchFeedback(
  messageId: string,
  feedback: "up" | "down" | null
): Promise<void> {
  await fetch(`/api/messages/${messageId}/feedback`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
}
