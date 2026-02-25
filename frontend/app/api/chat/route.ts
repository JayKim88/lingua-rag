import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const sessionCookie = request.cookies.get("session_id")?.value;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (sessionCookie) {
    headers["Cookie"] = `session_id=${sessionCookie}`;
  }

  const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!backendResponse.ok) {
    const errorText = await backendResponse.text();
    return new Response(errorText, { status: backendResponse.status });
  }

  // Forward Set-Cookie from backend
  const responseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  const setCookie = backendResponse.headers.get("set-cookie");
  if (setCookie) {
    responseHeaders.set("Set-Cookie", setCookie);
  }

  return new Response(backendResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}