"use client";

import { ADMIN_STYLES, setAdminStyle, useAdminStyle, type AdminStyle } from "@/lib/admin-style";
import "./admin-styles.css";

// The admin's outer frame, in the look this person picked (lib/admin-style.ts).
export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const style = useAdminStyle();
  return (
    <div className="adm-frame" data-adm-style={style}>
      {children}
    </div>
  );
}

// the picker, under the admin's menu
export function AdminStylePicker() {
  const style = useAdminStyle();
  return (
    <label className="adm-style-pick">
      <span>Admin look</span>
      <select className="adm-input" value={style} onChange={(e) => setAdminStyle(e.target.value as AdminStyle)}>
        {ADMIN_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
