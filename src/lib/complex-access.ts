import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export async function canViewComplex(slug: string) {
  const service = createServiceSupabase();
  if (!service) {
    return { ok: true as const, reason: "local" as const, complex: null };
  }
  const { data: complex } = await service.from("complexes").select("*").eq("slug", slug).maybeSingle();
  if (!complex) {
    return { ok: false as const, reason: "missing" as const, complex: null };
  }
  if (complex.published) {
    return { ok: true as const, reason: "published" as const, complex };
  }
  const server = await createServerSupabase();
  if (!server) return { ok: false as const, reason: "draft" as const, complex };
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) return { ok: false as const, reason: "draft" as const, complex };
  const { data: profile } = await server.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin" || complex.owner_id === user.id) {
    return { ok: true as const, reason: "staff" as const, complex };
  }
  const { data: member } = await service
    .from("complex_members")
    .select("profile_id")
    .eq("complex_id", complex.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (member) return { ok: true as const, reason: "staff" as const, complex };
  return { ok: false as const, reason: "draft" as const, complex };
}
