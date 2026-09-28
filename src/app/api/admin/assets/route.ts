import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { PUBLIC_ASSET_KINDS, type AssetKind } from "@/lib/types";
import { mediaObjectPath } from "@/lib/asset-path";

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { id?: string; complexId?: string; kind?: AssetKind };
  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });

  if (body.id) {
    const { data: row } = await sb.from("assets").select("*").eq("id", body.id).maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const objectPath = mediaObjectPath(row.path);
    const publicKind = PUBLIC_ASSET_KINDS.includes(row.kind as AssetKind);
    if (objectPath) await sb.storage.from(publicKind ? "media" : "private").remove([objectPath]);
    await sb.from("assets").delete().eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  if (body.complexId && body.kind) {
    const kinds = body.kind === "document" ? ["document", "other"] : [body.kind];
    const { data: rows } = await sb.from("assets").select("*").eq("complex_id", body.complexId).in("kind", kinds);
    const list = rows ?? [];
    const mediaPaths = list.filter((r) => r.path.startsWith("http")).map((r) => mediaObjectPath(r.path)).filter(Boolean);
    const privatePaths = list.filter((r) => !r.path.startsWith("http")).map((r) => r.path);
    if (mediaPaths.length) await sb.storage.from("media").remove(mediaPaths);
    if (privatePaths.length) await sb.storage.from("private").remove(privatePaths);
    await sb.from("assets").delete().eq("complex_id", body.complexId).in("kind", kinds);
    return NextResponse.json({ ok: true, count: list.length });
  }

  return NextResponse.json({ error: "Missing id" }, { status: 400 });
}
