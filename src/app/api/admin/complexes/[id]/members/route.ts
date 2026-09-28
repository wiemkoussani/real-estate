import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { addMember, listMemberIds, removeMember } from "@/lib/members";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const ids = await listMemberIds(service, id);
  return NextResponse.json({ memberIds: ids });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const body = await req.json();
  const profileId = String(body?.profileId ?? "");
  if (!profileId) return NextResponse.json({ error: "Choose a client" }, { status: 400 });
  const result = await addMember(service, id, profileId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const memberIds = await listMemberIds(service, id);
  return NextResponse.json({ ok: true, memberIds });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const body = await req.json();
  const profileId = String(body?.profileId ?? "");
  if (!profileId) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  const result = await removeMember(service, id, profileId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const memberIds = await listMemberIds(service, id);
  return NextResponse.json({ ok: true, memberIds });
}
