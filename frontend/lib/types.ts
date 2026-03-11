export interface Message {
  id: string;
  backendId?: string;         // DB UUID from SSE "done" event (used for feedback API calls)
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  isTruncated?: boolean;
  isSummary?: boolean;        // AI response that is a session summary
  isSummaryRequest?: boolean; // user message that triggered the summary
  feedback?: "up" | "down" | null;
  createdAt?: string; // ISO 8601 string
}

export interface SavedSummary {
  id: string;
  pdfId: string;
  pdfName: string;
  content: string;
  savedAt: string; // ISO 8601
}

export interface SavedNote {
  id: string;
  pdfId: string;
  pdfName: string;
  content: string;
  savedAt: string; // ISO 8601
}
