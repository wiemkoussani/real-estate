import type { SupabaseClient } from "@supabase/supabase-js";

export async function listMemberIds(service: SupabaseClient, complexId: string) {
  const { data: cx } = await service.from("complexes").select("owner_id").eq("id", complexId).maybeSingle();
  const owner = cx?.owner_id ? [cx.owner_id as string] : [];
  const { data, error } = await service.from("complex_members").select("profile_id").eq("complex_id", complexId);
  if (error) return owner;
  const ids = (data ?? []).map((row) => row.profile_id as string);
  for (const id of owner) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export async function listComplexIdsForUser(service: SupabaseClient, userId: string) {
  const { data, error } = await service.from("complex_members").select("complex_id").eq("profile_id", userId);
  if (!error) {
    const ids = (data ?? []).map((row) => row.complex_id as string);
    if (ids.length) return ids;
  }
  const { data: owned } = await service.from("complexes").select("id").eq("owner_id", userId);
  return (owned ?? []).map((row) => row.id as string);
}

export async function syncOwnerId(service: SupabaseClient, complexId: string) {
  const ids = await listMemberIds(service, complexId);
  await service.from("complexes").update({ owner_id: ids[0] ?? null }).eq("id", complexId);
}

export async function addMember(service: SupabaseClient, complexId: string, profileId: string) {
  const { error } = await service.from("complex_members").upsert({
    complex_id: complexId,
    profile_id: profileId,
  });
  if (error) {
    const { data: cx } = await service.from("complexes").select("owner_id").eq("id", complexId).maybeSingle();
    if (cx?.owner_id && cx.owner_id !== profileId) {
    return { error: "This project still only holds one client until the database update is applied." };
    }
    const { error: ownErr } = await service.from("complexes").update({ owner_id: profileId }).eq("id", complexId);
    return { error: ownErr?.message ?? null };
  }
  await syncOwnerId(service, complexId);
  return { error: null as string | null };
}

export async function removeMember(service: SupabaseClient, complexId: string, profileId: string) {
  const { error } = await service.from("complex_members").delete().eq("complex_id", complexId).eq("profile_id", profileId);
  if (error) {
    const { error: ownErr } = await service.from("complexes").update({ owner_id: null }).eq("id", complexId).eq("owner_id", profileId);
    return { error: ownErr?.message ?? null };
  }
  await syncOwnerId(service, complexId);
  return { error: null as string | null };
}
