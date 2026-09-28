import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMPLEX } from "@/lib/complex";
import { createServiceSupabase } from "@/lib/supabase/service";
import { canViewComplex } from "@/lib/complex-access";
import type { Unit } from "@/lib/complex";
import type { AssetRow, UnitRow } from "@/lib/types";

function mapUnit(row: UnitRow): Unit {
  return {
    id: row.mesh_id,
    displayId: row.display_id,
    type: (row.type === 2 || row.type === 3 ? row.type : 1) as 1 | 2 | 3,
    status: row.status,
    surface: row.surface,
    rooms: row.rooms,
    floor: row.floor,
    planImage: row.plan_path || `assets/plans/types/type-${row.type}.webp`,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const access = await canViewComplex(slug);
  if (access.reason === "draft") {
    return NextResponse.json({ error: "This project is not published" }, { status: 404 });
  }

  const sb = createServiceSupabase();
  if (sb && access.complex) {
    const [{ data: units }, { data: assets }] = await Promise.all([
      sb.from("units").select("*").eq("complex_id", access.complex.id),
      sb.from("assets").select("kind, path, sort_index").eq("complex_id", access.complex.id).order("sort_index"),
    ]);
    return NextResponse.json({
      source: "db",
      complex: access.complex,
      units: ((units as UnitRow[]) ?? []).map(mapUnit),
      assets: (assets as Pick<AssetRow, "kind" | "path" | "sort_index">[]) ?? [],
    });
  }

  if (access.reason === "missing" && sb) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = path.join(process.cwd(), "public", "complexes", slug, "data", "units.json");
    const raw = await readFile(file, "utf8");
    const json = JSON.parse(raw) as { units: Unit[] };
    return NextResponse.json({
      source: "file",
      complex: slug === COMPLEX.slug ? { slug: COMPLEX.slug, name: COMPLEX.name, asset_base: COMPLEX.assetBase, published: true } : null,
      units: json.units ?? [],
      assets: [],
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
