"use client";

import { type ReactNode, type RefObject, useRef } from "react";
import { type AdminVariant } from "@/lib/admin-data";

export type Group = string | null; // a variant id, or null for the product's own photos
export type PhotoRef = { kind: "db"; id: string } | { kind: "shoot"; path: string };
export type PhotoItem = { key: string; src: string; ref: PhotoRef; shoot: boolean };
// One group of photos (the product's own, or one option's): each can be dragged
// to a new place here or into another group; the buttons on a photo do the
// same on a phone, where there is no dragging. Files dropped here join it.
export function PhotoGroup({
  group,
  items,
  small = false,
  live,
  options,
  drop,
  setDrop,
  dragRef,
  onPlace,
  onRemove,
  onFiles,
  add,
}: {
  group: Group;
  items: PhotoItem[];
  small?: boolean;
  live: boolean;
  options: AdminVariant[] | null;
  drop: { group: Group; at: number } | null;
  setDrop: (d: { group: Group; at: number } | null) => void;
  dragRef: RefObject<PhotoRef | null>;
  onPlace: (ref: PhotoRef, to: Group, at?: number) => void;
  onRemove: (ref: PhotoRef) => void;
  onFiles: (files: File[]) => void;
  add: ReactNode;
}) {
  const here = drop?.group === group ? drop.at : -1;
  const own = items.filter((i) => !i.shoot).length;
  const same = (a: PhotoRef, b: PhotoRef) => (a.kind === "db" && b.kind === "db" ? a.id === b.id : a.kind === "shoot" && b.kind === "shoot" && a.path === b.path);
  return (
    <ul
      className={`ape-thumbs ${small ? "ape-thumbs--sm" : ""} ${here >= 0 ? "is-target" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const li = (e.target as HTMLElement).closest<HTMLElement>("[data-at]");
        let at = items.length;
        if (li) {
          const r = li.getBoundingClientRect();
          at = Number(li.dataset.at) + (e.clientX > r.left + r.width / 2 ? 1 : 0);
        }
        if (drop?.group !== group || drop.at !== at) setDrop({ group, at });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        let at = here >= 0 ? here : items.length;
        setDrop(null);
        const ref = dragRef.current;
        dragRef.current = null;
        if (ref) {
          const from = items.findIndex((i) => same(i.ref, ref));
          if (from >= 0 && from < at) at -= 1; // it leaves its old place first
          onPlace(ref, group, Math.min(at, own));
        } else if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
    >
      {items.map((it, i) => (
        <li
          key={it.key}
          data-at={i}
          className={`ape-thumb ${it.shoot ? "is-shoot" : ""} ${it.shoot && !live ? "is-off" : ""} ${here === i ? "is-before" : ""} ${here === items.length && i === items.length - 1 ? "is-after" : ""}`}
          draggable
          onDragStart={(e) => {
            dragRef.current = it.ref;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", it.key);
          }}
          onDragEnd={() => {
            dragRef.current = null;
            setDrop(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.src} alt="" draggable={false} />
          <div className="ape-thumb-tools">
            <button type="button" onClick={() => onPlace(it.ref, group, i - 1)} disabled={i === 0} aria-label="Move earlier">
              ‹
            </button>
            {!small && i > 0 && (
              <button type="button" onClick={() => onPlace(it.ref, group, 0)} aria-label="Make this the shelf photo" title="Make this the shelf photo">
                ★
              </button>
            )}
            <button type="button" onClick={() => onPlace(it.ref, group, i + 1)} disabled={i >= items.length - 1} aria-label="Move later">
              ›
            </button>
            <button type="button" className="is-del" onClick={() => onRemove(it.ref)} aria-label="Remove this photo">
              ×
            </button>
          </div>
          {options && (
            <select className="ape-thumb-opt" value={group ?? ""} onChange={(e) => onPlace(it.ref, e.target.value || null)} aria-label="Which option this photo shows">
              <option value="">The product</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </li>
      ))}
      <li className={here === items.length && items.length === 0 ? "is-before" : ""}>{add}</li>
    </ul>
  );
}
export function AddPhotos({ label, busy, onFiles }: { label: string; busy: boolean; onFiles: (files: File[]) => void }) {
  const pick = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="ape-opt-add" disabled={busy} onClick={() => pick.current?.click()}>
        + {label}
      </button>
      <input
        ref={pick}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
