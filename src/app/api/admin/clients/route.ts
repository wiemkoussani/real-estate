import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { brevoConfigured, inviteEmail, resetEmail, sendMail } from "@/lib/mail";
import { addMember } from "@/lib/members";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appUrl(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function inviteRedirect(req: Request) {
  return `${appUrl(req)}/client/set-password`;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { data, error } = await service.from("profiles").select("id, role, full_name, email").eq("role", "client").order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: members } = await service.from("complex_members").select("complex_id, profile_id");
  const { data: complexes } = await service.from("complexes").select("id, owner_id");
  const byClient = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = byClient.get(row.profile_id) ?? [];
    list.push(row.complex_id);
    byClient.set(row.profile_id, list);
  }
  for (const cx of complexes ?? []) {
    if (!cx.owner_id) continue;
    const list = byClient.get(cx.owner_id) ?? [];
    if (!list.includes(cx.id)) list.push(cx.id);
    byClient.set(cx.owner_id, list);
  }
  return NextResponse.json({
    clients: (data ?? []).map((cl) => ({ ...cl, complex_ids: byClient.get(cl.id) ?? [] })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = await req.json();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.full_name ?? "").trim() || email.split("@")[0];
  const complexId = body?.complex_id ? String(body.complex_id) : null;
  const resend = body?.resend === true;
  if (!emailRe.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const redirectTo = inviteRedirect(req);
  let userId: string | null = null;
  let via: "brevo" | "supabase" = "supabase";

  if (brevoConfigured()) {
    let linkType: "invite" | "recovery" = resend ? "recovery" : "invite";
    let generated = resend
      ? await service.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } })
      : await service.auth.admin.generateLink({
          type: "invite",
          email,
          options: { data: { full_name: fullName }, redirectTo },
        });
    if (generated.error && linkType === "invite") {
      linkType = "recovery";
      generated = await service.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    }
    if (generated.error || !generated.data.properties?.action_link) {
      return NextResponse.json({ error: generated.error?.message || "Could not create invite link" }, { status: 400 });
    }
    userId = generated.data.user?.id ?? null;
    const mail = linkType === "invite" ? inviteEmail(fullName, generated.data.properties.action_link) : resetEmail(generated.data.properties.action_link);
    const sent = await sendMail({ to: email, ...mail });
    if (!sent.ok) return NextResponse.json({ error: `Email failed: ${sent.error}` }, { status: 502 });
    via = "brevo";
  } else {
    const invited = await service.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
    userId = invited.data.user?.id ?? null;
    if (invited.error || resend) {
      const reset = await service.auth.resetPasswordForEmail(email, { redirectTo });
      if (reset.error && invited.error && !userId) {
        return NextResponse.json({ error: invited.error.message }, { status: 400 });
      }
    }
    if (!userId) {
      const listed = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
      userId = listed.data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    }
    via = "supabase";
  }

  if (!userId) return NextResponse.json({ error: "Could not resolve user" }, { status: 400 });

  const { error: profileErr } = await service.from("profiles").upsert({
    id: userId,
    role: "client",
    full_name: fullName,
    email,
  });
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  if (complexId) {
    const assigned = await addMember(service, complexId, userId);
    if (assigned.error) return NextResponse.json({ error: assigned.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mailed: true,
    via,
    client: { id: userId, email, full_name: fullName },
  });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  const { data: profile } = await service.from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!profile || profile.role !== "client") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await service.from("complexes").update({ owner_id: null }).eq("owner_id", id);
  await service.from("complex_members").delete().eq("profile_id", id);
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
