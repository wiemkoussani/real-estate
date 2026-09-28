"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import AxisMark from "@/components/AxisMark";
import PasswordField from "@/components/PasswordField";
import "../../admin/admin.css";

export default function ClientLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = params.get("setup") === "1";
  const denied = params.get("denied") === "1";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("Sign-in isn’t available yet.");
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace("/client");
    router.refresh();
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <AxisMark size={56} />
        <h1>Welcome</h1>
        <p className="lede">Sign in to follow your project.</p>
        {setup && <p className="muted">This page isn’t ready yet.</p>}
        {denied && <p className="err">This account doesn’t have access.</p>}
        <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <PasswordField label="Password" value={password} onChange={setPassword} required />
        {err && <p className="err">{err}</p>}
        <button className="btn wide" type="submit" disabled={busy}>{busy ? "…" : "Sign in"}</button>
        <a href="/client/forgot">Forgot password?</a>
      </form>
    </div>
  );
}
