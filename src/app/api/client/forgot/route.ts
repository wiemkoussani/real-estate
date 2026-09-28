import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { brevoConfigured, resetEmail, sendMail } from "@/lib/mail";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!emailRe.test(email)) return NextResponse.json({ ok: true });

  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ ok: true });

  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const redirectTo = `${env}/client/set-password`;

  if (brevoConfigured()) {
    const generated = await service.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (generated.data.properties?.action_link) {
      await sendMail({ to: email, ...resetEmail(generated.data.properties.action_link) });
    }
  } else {
    await service.auth.resetPasswordForEmail(email, { redirectTo });
  }
  return NextResponse.json({ ok: true });
}
