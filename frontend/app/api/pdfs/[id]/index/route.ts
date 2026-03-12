import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/pdfs/${id}/index`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
