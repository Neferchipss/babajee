"use client";

import { ADMIN_STYLES, setAdminStyle, useAdminStyle, type AdminStyle } from "@/lib/admin-style";
import "./design.css";

// Settings > Admin design: the four ways the admin can look and work, each
// with a small drawing of its layout. Each person picks their own; it's kept
// in this browser and changes at once (nothing else changes: same pages,
// same data, same rights).
export default function DesignPage() {
  const style = useAdminStyle();
  return (
    <div className="dsn">
      <header className="adm-pagehead">
        <h1>Admin design</h1>
        <p>Four ways the admin can look and work. Pick one and the admin switches at once. Every page, button and permission is the same in all four; only the layout and look change. Your pick is for you, on this device.</p>
      </header>
      <div className="dsn-grid">
        {ADMIN_STYLES.map((d) => (
          <article key={d.id} className={`adm-card dsn-card ${style === d.id ? "is-on" : ""}`}>
            <Sketch id={d.id} />
            <div className="dsn-text">
              <p className="dsn-based">{d.based}</p>
              <h2>
                {d.name}
                {style === d.id && <span className="adm-pill">In use</span>}
              </h2>
              <p>{d.about}</p>
              <ul>
                {d.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <div className="adm-actions">
                <button type="button" className="adm-btn pri" disabled={style === d.id} onClick={() => setAdminStyle(d.id)}>
                  {style === d.id ? "In use" : `Use ${d.name}`}
                </button>
                <a className="adm-btn" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/admin/?look=${d.id}`} target="_blank" rel="noreferrer">
                  Preview in a new tab
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// a small drawing of each layout
function Sketch({ id }: { id: AdminStyle }) {
  return (
    <div className={`dsn-sk dsn-sk--${id}`} aria-hidden="true">
      {id === "current" && (
        <>
          <i className="bar" />
          <i className="tree" />
          <i className="page">
            <b />
            <b />
          </i>
        </>
      )}
      {id === "shopify" && (
        <>
          <i className="top" />
          <i className="side" />
          <i className="page">
            <b />
            <b />
            <b />
          </i>
        </>
      )}
      {id === "ease" && (
        <>
          <i className="top" />
          <i className="tabs">
            <s />
            <s />
            <s />
            <s />
          </i>
          <i className="page">
            <b />
            <b />
            <b />
          </i>
        </>
      )}
      {id === "studio" && (
        <>
          <i className="rail" />
          <i className="panel" />
          <i className="crumbs" />
          <i className="page">
            <b />
            <b />
          </i>
          <i className="cmd" />
        </>
      )}
    </div>
  );
}
