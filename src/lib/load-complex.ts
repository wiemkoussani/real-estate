import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMPLEX, modelOf, type Unit } from "@/lib/complex";
import type { canViewComplex } from "@/lib/complex-access";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { AssetRow, ComplexRow, UnitRow } from "@/lib/types";

export type ComplexPayload = {
  source: "db" | "file";
  complex: (Partial<ComplexRow> & { slug?: string; name?: string; location_query?: string | null }) | undefined;
  units: Unit[];
  assets: Pick<AssetRow, "kind" | "path" | "sort_index">[];
  published: boolean;
};

function mapUnit(row: UnitRow): Unit {
  const type = (row.type === 2 || row.type === 3 ? row.type : 1) as 1 | 2 | 3;
  const model = (row.model || `${type}A`).toUpperCase();
  return {
    id: row.mesh_id,
    displayId: row.display_id,
    type,
    model,
    status: row.status,
    surface: row.surface,
    rooms: row.rooms,
    floor: row.floor,
    price: row.price || COMPLEX.defaultPriceByModel[model] || COMPLEX.defaultPriceByType[type] || 0,
    planImage: row.plan_path || `assets/plans/types/type-${row.type}.webp`,
  };
}

type Access = Awaited<ReturnType<typeof canViewComplex>>;

export async function loadComplexPayload(slug: string, access: Access): Promise<ComplexPayload | { error: string; status: number }> {
  const sb = createServiceSupabase();
  if (sb && access.complex) {
    const [{ data: units }, { data: assets }] = await Promise.all([
      sb.from("units").select("*").eq("complex_id", access.complex.id),
      sb.from("assets").select("kind, path, sort_index").eq("complex_id", access.complex.id).order("sort_index"),
    ]);
    return {
      source: "db",
      complex: access.complex as ComplexRow,
      units: ((units as UnitRow[]) ?? []).map(mapUnit),
      assets: (assets as Pick<AssetRow, "kind" | "path" | "sort_index">[]) ?? [],
      published: Boolean(access.complex.published),
    };
  }

  if (access.reason === "missing" && sb) {
    return { error: "Not found", status: 404 };
  }

  try {
    const file = path.join(process.cwd(), "public", "complexes", slug, "data", "units.json");
    const raw = await readFile(file, "utf8");
    const json = JSON.parse(raw) as { units: Unit[] };
    const units = (json.units ?? []).map((u) => {
      const type = (u.type === 2 || u.type === 3 ? u.type : 1) as 1 | 2 | 3;
      const model = modelOf({ ...u, type });
      return {
        ...u,
        type,
        model,
        price: u.price || COMPLEX.defaultPriceByModel[model] || COMPLEX.defaultPriceByType[type] || 0,
      };
    });
    return {
      source: "file",
      complex: slug === COMPLEX.slug ? { slug: COMPLEX.slug, name: COMPLEX.name, asset_base: COMPLEX.assetBase, published: true } : undefined,
      units,
      assets: [],
      published: true,
    };
  } catch {
    return { error: "Not found", status: 404 };
  }
}
