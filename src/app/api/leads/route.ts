import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hits = new Map<string, { n: number; t: number }>();

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function rateLimit(ip: string) {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now - row.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return true;
  }
  if (row.n >= 8) return false;
  row.n += 1;
  return true;
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(clientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const nom = String(body?.nom ?? "").trim().slice(0, 80);
    const prenom = String(body?.prenom ?? "").trim().slice(0, 80);
    const email = String(body?.email ?? "").trim().slice(0, 120) || "none@lead.local";
    let tel = String(body?.tel ?? "").trim().slice(0, 40);
    if (tel && !tel.startsWith("+")) {
      const dial = String(body?.dial ?? "+").trim();
      tel = `${dial.startsWith("+") ? dial : "+"}${tel.replace(/^0+/, "")}`;
    }
    const gender = String(body?.gender ?? "").trim().slice(0, 20);
    const subject = String(body?.subject ?? "").trim().slice(0, 120);
    const message = String(body?.message ?? "").trim().slice(0, 800);
    const toFavorites = Boolean(body?.toFavorites);
    const unitId = body?.unitId ? String(body.unitId).slice(0, 80) : null;
    const unitDisplayId = body?.unitDisplayId ? String(body.unitDisplayId).slice(0, 40) : null;
    const complex = String(body?.complex ?? "villas-ajyad").slice(0, 80);

    if (!nom || !prenom) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (email !== "none@lead.local" && !emailRe.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!tel && email === "none@lead.local") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.info("lead (no supabase)", { nom, prenom, email, tel, unitDisplayId, complex });
      return NextResponse.json({ ok: true, stored: "log" });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: cx } = await supabase.from("complexes").select("id").eq("slug", complex).maybeSingle();
    const base = {
      nom: gender ? `${gender} ${nom}` : nom,
      prenom,
      email,
      tel: tel || "-",
      unit_id: unitId,
      unit_display_id: unitDisplayId,
      complex_slug: complex,
      complex_id: cx?.id ?? null,
    };
    let { error } = await supabase.from("leads").insert({
      ...base,
      gender,
      subject,
      message,
      to_favorites: toFavorites,
    });
    if (error) {
      const retry = await supabase.from("leads").insert(base);
      error = retry.error;
    }
    if (error) {
      console.error("lead insert failed");
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, stored: "db" });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
