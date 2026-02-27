import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!backendResponse.ok) {
    const errorText = await backendResponse.text();
    return new Response(errorText, { status: backendResponse.status });
  }

  return new Response(backendResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
