import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { slugFromName } from "@/lib/slug";
import { createServiceSupabase } from "@/lib/supabase/service";
import { mediaObjectPath } from "@/lib/asset-path";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase.from("complexes").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ complexes: data });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const base = slugFromName(name);
  let slug = base;
  let n = 2;
  for (;;) {
    const { data: taken } = await auth.supabase.from("complexes").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${n}`;
    n += 1;
  }
  const { data, error } = await auth.supabase
    .from("complexes")
    .insert({
      name,
      slug,
      location_query: body.location_query || name,
      published: false,
      owner_id: body.owner_id || null,
      asset_base: null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ complex: data });
}

async function emptyPrefix(sb: ReturnType<typeof createServiceSupabase>, bucket: string, prefix: string) {
  if (!sb) return;
  const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!data?.length) return;
  const files: string[] = [];
  for (const item of data) {
    const child = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) files.push(child);
    else await emptyPrefix(sb, bucket, child);
  }
  if (files.length) await sb.storage.from(bucket).remove(files);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as { id?: string };
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing project" }, { status: 400 });

  const sb = createServiceSupabase() ?? auth.supabase;
  const { data: cx, error: cxErr } = await sb.from("complexes").select("id, slug").eq("id", id).maybeSingle();
  if (cxErr || !cx) return NextResponse.json({ error: cxErr?.message || "Project not found" }, { status: 404 });

  const { data: assets } = await sb.from("assets").select("path").eq("complex_id", cx.id);
  const httpPaths = (assets ?? []).filter((a) => a.path.startsWith("http")).map((a) => mediaObjectPath(a.path)).filter(Boolean);
  const privatePaths = (assets ?? []).filter((a) => !a.path.startsWith("http")).map((a) => a.path);
  if (httpPaths.length) await sb.storage.from("media").remove(httpPaths);
  if (privatePaths.length) await sb.storage.from("private").remove(privatePaths);
  const service = createServiceSupabase();
  await emptyPrefix(service, "media", cx.slug);
  await emptyPrefix(service, "private", cx.slug);

  const { error } = await sb.from("complexes").delete().eq("id", cx.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
