import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { AssetKind } from "@/lib/types";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as {
    complexId?: string;
    kind?: AssetKind;
    stored?: string;
    sort_index?: number;
  };
  const complexId = String(body.complexId || "");
  const kind = body.kind as AssetKind;
  const stored = String(body.stored || "");
  if (!complexId || !kind || !stored) {
    return NextResponse.json({ error: "Missing commit" }, { status: 400 });
  }

  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });

  if (kind === "glb") {
    await sb.from("assets").delete().eq("complex_id", complexId).eq("kind", kind);
  }
  if (kind === "branding") {
    // Replace only the same slot (agency / project), keep the other logo.
    const file = stored.split("?")[0].split("/").pop()?.toLowerCase() || "";
    const slot = file.startsWith("project.") ? "project" : file.startsWith("agency.") ? "agency" : "";
    if (slot) {
      const { data: existing } = await sb.from("assets").select("id, path").eq("complex_id", complexId).eq("kind", "branding");
      const drop = (existing ?? []).filter((a) => {
        const name = String(a.path).split("?")[0].split("/").pop()?.toLowerCase() || "";
        return name.startsWith(`${slot}.`);
      });
      if (drop.length) await sb.from("assets").delete().in("id", drop.map((a) => a.id));
    } else {
      await sb.from("assets").delete().eq("complex_id", complexId).eq("kind", kind);
    }
  }
  await sb.from("assets").delete().eq("complex_id", complexId).eq("path", stored);
  const { error: rowErr } = await sb.from("assets").insert({
    complex_id: complexId,
    kind,
    path: stored,
    sort_index: body.sort_index ?? (kind === "branding" && /project\./i.test(stored) ? 1 : 0),
  });
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

  if (kind === "glb") await sb.from("complexes").update({ glb_path: stored }).eq("id", complexId);
  if (kind === "branding" && /agency\./i.test(stored)) {
    await sb.from("complexes").update({ logo_path: stored }).eq("id", complexId);
  }
  if (kind === "branding" && !/project\./i.test(stored) && !/agency\./i.test(stored)) {
    await sb.from("complexes").update({ logo_path: stored }).eq("id", complexId);
  }
  if (kind === "frame_low" || kind === "frame_high") {
    const { count } = await sb.from("assets").select("id", { count: "exact", head: true }).eq("complex_id", complexId).eq("kind", kind);
    if (count) await sb.from("complexes").update({ total_frames: count }).eq("id", complexId);
  }

  return NextResponse.json({ ok: true });
}
