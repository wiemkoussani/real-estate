"use client";

import { useState } from "react";
import Link from "next/link";
import AxisMark from "@/components/AxisMark";
import "../../admin/admin.css";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/client/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr("We couldn’t send the email.");
      return;
    }
    setOk(true);
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <AxisMark size={56} />
        <h1>Reset password</h1>
        <p className="lede">We’ll send a link to choose a new one.</p>
        {ok ? <p className="ok">If that email is registered, a link is on its way.</p> : (
          <>
            <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
            {err && <p className="err">{err}</p>}
            <button className="btn wide" type="submit" disabled={busy}>{busy ? "…" : "Send link"}</button>
          </>
        )}
        <Link href="/client/login">Back to sign in</Link>
      </form>
    </div>
  );
}
