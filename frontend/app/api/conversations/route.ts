import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ conversations: [] }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ conversations: [] }, { status: 200 });
  }
}
