import { COMPLEX } from "@/lib/complex";
import AxisMark from "@/components/AxisMark";

export default function QrPage() {
  const src = `/api/qr?slug=${COMPLEX.slug}`;
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", justifyItems: "center", gap: 16, fontFamily: "Segoe UI, sans-serif", textAlign: "center", padding: 24 }}>
      <AxisMark size={56} />
      <h1>{COMPLEX.name}</h1>
      <p>Scan to visit the tour</p>
      <img src={src} alt="QR code" width={320} height={320} />
      <a href={src} download={`${COMPLEX.slug}-qr.png`}>Download</a>
    </main>
  );
}
