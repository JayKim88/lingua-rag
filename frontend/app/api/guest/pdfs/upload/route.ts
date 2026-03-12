import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  // Forward client IP for rate limiting
  const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const res = await fetch(`${BACKEND_URL}/api/guest/pdfs/upload`, {
    method: "POST",
    headers: { "X-Forwarded-For": clientIp },
    body: formData,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
