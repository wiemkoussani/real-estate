import { renderComplex } from "./render-complex";

export default async function ComplexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderComplex(slug);
}
