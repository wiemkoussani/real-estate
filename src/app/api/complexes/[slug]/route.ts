import { NextResponse } from "next/server";
import { canViewComplex } from "@/lib/complex-access";
import { loadComplexPayload } from "@/lib/load-complex";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const access = await canViewComplex(slug);
  if (access.reason === "draft") {
    return NextResponse.json({ error: "This project is not published" }, { status: 404 });
  }

  const payload = await loadComplexPayload(slug, access);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  const headers = payload.published
    ? { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
    : { "Cache-Control": "private, no-store" };

  return NextResponse.json(
    {
      source: payload.source,
      complex: payload.complex,
      units: payload.units,
      assets: payload.assets,
    },
    { headers },
  );
}
