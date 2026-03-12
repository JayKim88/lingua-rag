const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/api/guest/pdfs/${id}/status`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
