"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AxisWatermark, IcBell, IcCamera, IcChart, IcChevronDown, IcGrid, IcHelp, IcLogout, IcUsers } from "./DashIcons";
import GlobalSearch, { type SearchHit } from "./GlobalSearch";
import "../admin/admin.css";
import "./dashboard.css";

/** "project" = inside one project (its own Apartments / Analytics / Contacts tabs) */
export type ClientView = "projects" | "analytics" | "contacts" | "project";

type Props = {
  children: React.ReactNode;
  view: ClientView;
  onView: (view: ClientView) => void;
  /** new visitors + new interested people, over all of this user's projects */
  notifications: number;
  name: string;
  avatarUrl: string | null;
  onAvatar: (url: string) => void;
  /** everything "Search anything" can find */
  searchItems: SearchHit[];
};

/** Square-crop and shrink the picked photo to 256px WebP before upload. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (blob && blob.type === "image/webp") return blob;
  // Safari < 16 cannot encode WebP
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpg) throw new Error("encode failed");
  return jpg;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function ClientShell({ children, view, onView, notifications, name, avatarUrl, onAvatar, searchItems }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const signOut = async () => {
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/client/login");
    router.refresh();
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoErr("");
    setUploading(true);
    try {
      const blob = await shrinkPhoto(file);
      const form = new FormData();
      form.append("file", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
      const res = await fetch("/api/client/avatar", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      onAvatar(json.avatarUrl);
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const nav: [ClientView, string, React.ReactNode][] = [
    ["projects", "Projects", <IcGrid key="g" size={24} />],
    ["analytics", "Analytics", <IcChart key="c" size={24} />],
    ["contacts", "Contacts", <IcUsers key="u" size={26} />],
  ];

  return (
    <div className={`axd axd-view-${view}`}>
      <AxisWatermark className="axd-watermark" />

      <aside className="axd-side">
        <div className="axd-logo">
          <img src="/branding/axis.png" alt="AXIS Studio" width={76} height={99} />
        </div>

        <nav className="axd-nav" aria-label="Main">
          {nav.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={`axd-nav-item${view === key ? " on" : ""}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => onView(key)}
            >
              {icon}
              <span className="axd-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="axd-divider" />

        <div className="axd-side-bottom">
          <button type="button" className="axd-nav-item axd-small" onClick={() => onView("projects")}>
            <span className="axd-bell">
              <IcBell size={22} />
              {notifications > 0 ? <span className="axd-dot">{notifications > 99 ? "99+" : notifications}</span> : null}
            </span>
            <span className="axd-label">Notifications</span>
          </button>
          <button type="button" className="axd-nav-item axd-small" title="Help (coming soon)">
            <IcHelp size={22} />
            <span className="axd-label">Help</span>
          </button>

          <div className="axd-account" ref={accountRef}>
            <button
              type="button"
              className={`axd-avatar${uploading ? " busy" : ""}`}
              title="Change profile photo"
              aria-label="Change profile photo"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(name)}</span>}
              <span className="axd-avatar-cam"><IcCamera size={16} /></span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              className="axd-account-toggle"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="axd-account-text">
                <span className="axd-account-name">{name || "My account"}</span>
                <span className="axd-account-role">Studio User</span>
              </span>
              <span className={`axd-chev${menuOpen ? " up" : ""}`}><IcChevronDown size={15} /></span>
            </button>
            {menuOpen ? (
              <div className="axd-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void signOut()}>
                  <IcLogout size={18} />
                  Log out
                </button>
              </div>
            ) : null}
            {photoErr ? <p className="axd-photo-err" role="alert">{photoErr}</p> : null}
          </div>
        </div>
      </aside>

      <div className="axd-work">
        <GlobalSearch items={searchItems} />
        {children}
      </div>
    </div>
  );
}
