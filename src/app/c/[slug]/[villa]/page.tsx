import { renderComplex } from "../render-complex";

/** /c/<slug>/<villa number>: same tour, opened straight inside that villa. */
export default async function VillaPage({ params }: { params: Promise<{ slug: string; villa: string }> }) {
  const { slug, villa } = await params;
  return renderComplex(slug, decodeURIComponent(villa));
}
