import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { PUBLIC_ASSET_KINDS, type AssetKind } from "@/lib/types";
import { mimeFor, normalizeRel } from "@/lib/asset-path";

const KINDS = new Set<AssetKind>([
  "frame_low",
  "frame_high",
  "villa_360",
  "plan",
  "gallery",
  "branding",
  "glb",
  "document",
  "other",
]);

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { complexId?: string; kind?: AssetKind; relativePath?: string; contentType?: string };
  const complexId = String(body.complexId || "");
  const kind = body.kind as AssetKind;
  if (!complexId || !KINDS.has(kind) || !body.relativePath) {
    return NextResponse.json({ error: "Missing file info" }, { status: 400 });
  }

  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });

  const { data: cx, error: cxErr } = await sb.from("complexes").select("id, slug").eq("id", complexId).maybeSingle();
  if (cxErr || !cx) return NextResponse.json({ error: cxErr?.message || "Project not found" }, { status: 404 });

  const rel = normalizeRel(kind, body.relativePath);
  if (!rel) return NextResponse.json({ error: "Bad file name" }, { status: 400 });

  const publicKind = PUBLIC_ASSET_KINDS.includes(kind);
  const bucket = publicKind ? "media" : "private";
  const objectPath = `${cx.slug}/${kind}/${rel}`;
  const contentType = mimeFor(rel, body.contentType || "");

  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(objectPath, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not sign upload" }, { status: 500 });

  const stored = publicKind ? sb.storage.from("media").getPublicUrl(objectPath).data.publicUrl : objectPath;
  const sortMatch = rel.match(/(\d+)(?=\.[^.]+$)/);
  const sort_index = sortMatch ? parseInt(sortMatch[1], 10) : 0;

  return NextResponse.json({
    bucket,
    objectPath,
    token: data.token,
    stored,
    sort_index,
    contentType,
  });
}
