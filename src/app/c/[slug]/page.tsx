import ComplexApp from "@/components/ComplexApp";
import { canViewComplex } from "@/lib/complex-access";
import Link from "next/link";

export default async function ComplexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await canViewComplex(slug);
  if (!access.ok) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", fontFamily: "Segoe UI, sans-serif", color: "#1b2430", padding: 24, textAlign: "center" }}>
        <p style={{ color: "#1eb8b0", fontWeight: 800, letterSpacing: "0.16em" }}>AXIS</p>
        <h1 style={{ margin: "8px 0 10px" }}>This project is not available</h1>
        <p style={{ color: "#7a8794", maxWidth: 420 }}>It is still a draft, or the link is wrong. If you are the client, sign in to your workspace.</p>
        <p style={{ marginTop: 18 }}><Link href="/client/login">Client sign in</Link></p>
      </main>
    );
  }
  return <ComplexApp slug={slug} />;
}
