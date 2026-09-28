"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { completeAuthFromUrl } from "@/lib/auth-link";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const nextRaw = params.get("next") || "/client/set-password";
    const next = nextRaw.startsWith("/") ? nextRaw : "/client/set-password";
    const sb = createBrowserSupabase();
    if (!sb) {
      router.replace("/client/login?setup=1");
      return;
    }
    void completeAuthFromUrl(sb).then(({ error }) => {
      if (error) {
        router.replace(`/client/set-password?error=${encodeURIComponent(error)}`);
        return;
      }
      router.replace(next);
    });
  }, [params, router]);

  return <p style={{ minHeight: "100dvh", display: "grid", placeItems: "center", color: "#9eb0bc" }}>Opening…</p>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
