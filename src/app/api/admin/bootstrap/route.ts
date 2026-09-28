import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export async function POST() {
  const server = await createServerSupabase();
  const service = createServiceSupabase();
  if (!server || !service) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const allowFirst = process.env.ALLOW_FIRST_ADMIN === "true";
  const { count } = await service.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
  const noAdmin = (count ?? 0) === 0;
  const match = bootstrap && user.email.toLowerCase() === bootstrap;

  if (!match && !(allowFirst && noAdmin)) {
    const { data } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, role: data?.role ?? "client", promoted: false });
  }

  const { error } = await service.from("profiles").upsert({
    id: user.id,
    role: "admin",
    full_name: user.user_metadata?.full_name ?? user.email.split("@")[0],
  });
  if (error) return NextResponse.json({ error: "Could not promote" }, { status: 500 });
  return NextResponse.json({ ok: true, role: "admin", promoted: true });
}
