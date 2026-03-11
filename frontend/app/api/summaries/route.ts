import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ summaries: [] }, { status: 401 });

  const pdfId = request.nextUrl.searchParams.get("pdf_id") ?? "";
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/summaries?pdf_id=${encodeURIComponent(pdfId)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ summaries: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  try {
    const res = await fetch(`${BACKEND_URL}/api/summaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
