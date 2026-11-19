"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Suppliers from "@/components/admin/stock/Suppliers";
import { errText } from "@/lib/orders-db";
import { listSuppliers, type Supplier } from "@/lib/stock-in/db";

// Inventory › Suppliers: add, edit, deactivate. Bills pick from this list.
export default function SuppliersPage() {
  const [list, setList] = useState<Supplier[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => listSuppliers().then(setList, (e) => (setErr(errText(e)), setList([]))), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div style={{ maxWidth: 760 }}>
      <header className="adm-pagehead">
        <h1>Suppliers</h1>
        <p>
          Who the shop buys from, with their GSTIN to claim the GST on their bills. Only staff see this. Bills are in <Link href="/admin/inventory/purchases">Purchase bills</Link>.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      <Suppliers list={list} onChanged={load} />
    </div>
  );
}
