export type AppRole = "admin" | "client";
export type UnitStatus = "available" | "reserved" | "sold";
export type AssetKind =
  | "frame_low"
  | "frame_high"
  | "villa_360"
  | "scene_360"
  | "plan"
  | "gallery"
  | "branding"
  | "glb"
  | "document"
  | "other";

export const PUBLIC_ASSET_KINDS: AssetKind[] = [
  "frame_low",
  "frame_high",
  "villa_360",
  "scene_360",
  "plan",
  "gallery",
  "branding",
  "glb",
];

export type Profile = {
  id: string;
  role: AppRole;
  full_name: string | null;
};

export type ComplexRow = {
  id: string;
  slug: string;
  name: string;
  location_query: string | null;
  owner_id: string | null;
  published: boolean;
  asset_base: string | null;
  glb_path: string | null;
  logo_path: string | null;
  total_frames: number;
  villa_frames: number;
  render_w: number;
  render_h: number;
  description?: string | null;
  city?: string | null;
  created_at?: string;
};

/** Client dashboard counters for one project (see /api/client/dashboard). */
export type ProjectStats = {
  /** tour visits: every opening counts (unique visitors are counted per device) */
  visitors: number;
  /** visitors since the client last opened the project */
  newVisitors: number;
  /** people interested in a villa (leads) since the client last opened the project */
  newLeads: number;
  /** red badge = 1 if there are new visitors (however many) + newLeads */
  badge: number;
  lastSeenAt: string | null;
};

export type UnitRow = {
  id: string;
  complex_id: string;
  mesh_id: string;
  display_id: string;
  type: number;
  model: string | null;
  status: UnitStatus;
  surface: number;
  rooms: number;
  floor: number;
  price: number;
  plan_path: string | null;
};

export type LeadRow = {
  id: string;
  created_at: string;
  nom: string;
  prenom: string;
  email: string;
  tel: string;
  unit_id: string | null;
  unit_display_id: string | null;
  complex_slug: string;
  complex_id: string | null;
  to_favorites?: boolean | null;
  favorite_units?: string[] | null;
  gender?: string | null;
  subject?: string | null;
  message?: string | null;
  status?: LeadStatus | null;
};

export type LeadStatus = "new" | "in_progress" | "sold";

export type AssetRow = {
  id: string;
  complex_id: string;
  kind: AssetKind;
  path: string;
  sort_index: number;
};
