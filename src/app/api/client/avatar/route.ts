import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Profile photo: the browser sends an already-resized image; stored in the public media bucket. */
export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No image" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 2 MB)" }, { status: 400 });

  const { data: prev } = await service.from("profiles").select("avatar_url").eq("id", auth.user.id).maybeSingle();
  const objectPath = `avatars/${auth.user.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await service.storage.from("media").upload(objectPath, file, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = service.storage.from("media").getPublicUrl(objectPath).data.publicUrl;
  const { error } = await service.from("profiles").update({ avatar_url: url }).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // drop the old photo
  const marker = "/object/public/media/";
  const old = prev?.avatar_url as string | null | undefined;
  if (old && old.includes(marker + "avatars/")) {
    await service.storage.from("media").remove([decodeURIComponent(old.split(marker)[1].split("?")[0])]);
  }
  return NextResponse.json({ avatarUrl: url });
}
