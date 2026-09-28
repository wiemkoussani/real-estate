"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import AxisMark from "@/components/AxisMark";
import PasswordField from "@/components/PasswordField";
import { completeAuthFromUrl } from "@/lib/auth-link";
import "../../admin/admin.css";

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(params.get("error") || "");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("Sign-in isn’t available yet.");
      return;
    }
    void completeAuthFromUrl(sb).then(({ session, error }) => {
      if (session) {
        setReady(true);
        setErr("");
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        return;
      }
      setReady(false);
      setErr(error || params.get("error") || "This link has expired. Ask for a new invitation.");
    });
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    const sb = createBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
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
        <h1>Create a password</h1>
        <p className="lede">Then you’ll see your project.</p>
        {err && <p className="err">{err}</p>}
        <PasswordField label="New password" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" disabled={!ready} />
        <PasswordField label="Confirm" value={confirm} onChange={setConfirm} required minLength={8} autoComplete="new-password" disabled={!ready} />
        <button className="btn wide" type="submit" disabled={busy || !ready}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
