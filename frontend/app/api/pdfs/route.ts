import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/pdfs`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const formData = await request.formData();
  const res = await fetch(`${BACKEND_URL}/api/pdfs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
