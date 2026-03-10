import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; pageNum: string }> },
) {
  const { id, pageNum } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(
    `${BACKEND_URL}/api/pdfs/${id}/page/${pageNum}/image`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (!res.ok) return new Response("Error", { status: res.status });

  const data = await res.json();
  return Response.json(data);
}
