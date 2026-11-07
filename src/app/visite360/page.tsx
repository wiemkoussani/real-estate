"use client";

import Visite360Viewer from "@/components/Visite360Viewer";

/** Temporary harness to verify floor rings — delete after fix. */
export default function Visite360Page() {
  return (
    <main style={{ position: "fixed", inset: 0, background: "#0b1220" }}>
      <Visite360Viewer startId="10000" />
    </main>
  );
}
