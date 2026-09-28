"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import AxisMark from "@/components/AxisMark";
import "../admin/admin.css";

export type ClientTab = "overview" | "units" | "leads" | "qr";

type Props = {
  children: React.ReactNode;
  tab?: ClientTab;
  onTab?: (tab: ClientTab) => void;
  leads?: number;
  tourHref?: string;
};

export default function ClientShell({ children, tab, onTab, leads = 0, tourHref }: Props) {
  const router = useRouter();
  const signOut = async () => {
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/client/login");
    router.refresh();
  };
  const go = (next: ClientTab) => (e: React.MouseEvent) => {
    e.preventDefault();
    onTab?.(next);
  };
  return (
    <div className="portal portal-client">
      <aside className="portal-side">
        <div className="brand">
          <AxisMark size={40} />
        </div>
        <nav>
          <a className={tab === "overview" ? "on" : ""} href="#ov" onClick={go("overview")}>Overview</a>
          <a className={tab === "units" ? "on" : ""} href="#un" onClick={go("units")}>Units</a>
          <a className={tab === "leads" ? "on" : ""} href="#ld" onClick={go("leads")}>Leads{leads ? ` (${leads})` : ""}</a>
          <a className={tab === "qr" ? "on" : ""} href="#qr" onClick={go("qr")}>Code</a>
          {tourHref && <Link href={tourHref}>View tour</Link>}
        </nav>
        <button type="button" className="side-out" onClick={() => void signOut()}>Sign out</button>
      </aside>
      <div className="portal-body">
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
