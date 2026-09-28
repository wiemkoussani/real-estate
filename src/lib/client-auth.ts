import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireClient() {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (data?.role !== "client") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, supabase, user, profile: data };
}
