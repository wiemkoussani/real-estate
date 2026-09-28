"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import AxisMark from "@/components/AxisMark";
import { IconChevron } from "@/components/Icons";
import type { ComplexRow } from "@/lib/types";
import "./admin.css";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [projects, setProjects] = useState<Pick<ComplexRow, "id" | "name" | "slug">[]>([]);
  const [toursOpen, setToursOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/complexes")
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.complexes)) {
          setProjects(json.complexes.map((c: ComplexRow) => ({ id: c.id, name: c.name, slug: c.slug })));
        }
      })
      .catch(() => setProjects([]));
  }, [path]);

  const signOut = async () => {
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="portal">
      <aside className="portal-side">
        <div className="brand">
          <AxisMark size={40} />
        </div>
        <nav>
          <Link className={path === "/admin" ? "on" : ""} href="/admin">Projects</Link>
          <Link className={path.startsWith("/admin/clients") ? "on" : ""} href="/admin/clients">Clients</Link>
          {projects.length > 0 && (
            <div className="side-tours">
              <button type="button" className="side-label tours-toggle" onClick={() => setToursOpen((v) => !v)}>
                <span>Tours</span>
                <IconChevron size={16} className={toursOpen ? "open" : ""} />
              </button>
              {toursOpen && (
                <div className="tour-list">
                  {projects.map((p) => (
                    <Link key={p.id} href={`/c/${p.slug}`}>{p.name}</Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
        <button type="button" className="side-out" onClick={() => void signOut()}>Sign out</button>
      </aside>
      <div className="portal-body">
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
