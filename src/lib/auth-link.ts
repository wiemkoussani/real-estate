import type { SupabaseClient } from "@supabase/supabase-js";

type OtpType = "invite" | "recovery" | "email" | "magiclink" | "signup";

function otpType(value: string | null): OtpType | null {
  if (value === "invite" || value === "recovery" || value === "email" || value === "magiclink" || value === "signup") {
    return value;
  }
  return null;
}

export async function completeAuthFromUrl(sb: SupabaseClient) {
  if (typeof window === "undefined") return { session: null as null, error: null as string | null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const access_token = hash.get("access_token") || search.get("access_token");
  const refresh_token = hash.get("refresh_token") || search.get("refresh_token");
  if (access_token && refresh_token) {
    const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
    return { session: data.session, error: error?.message ?? null };
  }
  const code = search.get("code");
  if (code) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    return { session: data.session, error: error?.message ?? null };
  }
  const token_hash = search.get("token_hash") || search.get("token");
  const type = otpType(search.get("type") || hash.get("type"));
  if (token_hash && type) {
    const { data, error } = await sb.auth.verifyOtp({ token_hash, type });
    return { session: data.session, error: error?.message ?? null };
  }
  const { data } = await sb.auth.getSession();
  return { session: data.session, error: null as string | null };
}
