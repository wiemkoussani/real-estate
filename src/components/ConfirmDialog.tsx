"use client";

import { useCallback, useState } from "react";

export function useConfirm() {
  const [box, setBox] = useState<{ title: string; message: string; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback((message: string, title = "Are you sure?") => {
    return new Promise<boolean>((resolve) => setBox({ title, message, resolve }));
  }, []);

  const close = (ok: boolean) => {
    box?.resolve(ok);
    setBox(null);
  };

  const dialog = box ? (
    <div className="warn-overlay" role="alertdialog" aria-modal="true" onClick={() => close(false)}>
      <div className="warn-card" onClick={(e) => e.stopPropagation()}>
        <h3>{box.title}</h3>
        <p>{box.message}</p>
        <div className="warn-actions">
          <button type="button" className="btn ghost" onClick={() => close(false)}>Cancel</button>
          <button type="button" className="btn" onClick={() => close(true)}>OK</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
