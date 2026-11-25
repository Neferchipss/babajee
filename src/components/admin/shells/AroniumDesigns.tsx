"use client";

import { useState } from "react";
import { ADMIN_STYLES, setAdminStyle, useAdminStyle, type AdminStyle } from "@/lib/admin-style";
import { ArScreen, ArToolbar } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Admin theme, its own entry in the menu under Storefront: the two designs as rows, each with
// its drawing (passed in from the page, which keeps the drawings' styles).
// Use switches at once and is saved on the account; Preview opens the admin
// in a new tab in that design without changing anything.
export default function AroniumDesigns({ sketch }: { sketch: (id: AdminStyle) => React.ReactNode }) {
  const style = useAdminStyle();
  const [sel, setSel] = useState<AdminStyle>(style);
  const [help, setHelp] = useState(false);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const picked = ADMIN_STYLES.find((d) => d.id === sel) ?? ADMIN_STYLES[0];
  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "paid", label: "Use design", disabled: sel === style, onClick: () => setAdminStyle(sel) },
          { icon: "preview", label: "Preview", onClick: () => window.open(`${base}/admin/?look=${sel}`, "_blank", "noopener") },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <div className="arc-pane">
        <ArInfo>Two ways the admin can look and work. Every page, button and permission is the same in both; only the layout and look change. Your pick is saved on your account, so it follows you to any device.</ArInfo>
        <div className="arc-designs" role="listbox" aria-label="Admin designs">
          {ADMIN_STYLES.map((d) => (
            <article key={d.id} role="option" aria-selected={sel === d.id} className={`arc-design ${style === d.id ? "is-on" : ""}`} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAdminStyle(d.id)} onClick={() => setSel(d.id)} onDoubleClick={() => setAdminStyle(d.id)} style={sel === d.id ? { outline: "1px solid #1ba1e2" } : undefined}>
              {sketch(d.id)}
              <div>
                <p>{d.based}</p>
                <h3>{d.name}</h3>
                <p>{d.about}</p>
                <ul>
                  {d.points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="arc-design-btns">
                {style === d.id ? (
                  <span className="arc-inuse">✓ In use</span>
                ) : (
                  <button type="button" className="arc-btn is-pri" onClick={() => setAdminStyle(d.id)}>
                    Use {d.name}
                  </button>
                )}
                <a className="arc-btn" href={`${base}/admin/?look=${d.id}`} target="_blank" rel="noreferrer">
                  Preview in a new tab
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="arc-note">Selected: {picked.name}</p>
      </div>
      <ArHelp open={help} onClose={() => setHelp(false)} title="Admin design">
        <p>Pick how the admin looks for you. It switches at once, and the choice is saved on your account.</p>
        <p>Preview opens the admin in a new tab in that design, without changing yours. Nothing else changes between designs: same pages, same data, same rights.</p>
      </ArHelp>
    </ArScreen>
  );
}
