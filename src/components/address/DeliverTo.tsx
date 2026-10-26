"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EMPTY_ADDRESS,
  shortLine,
  withPlace,
  type Address,
  type AddressInput,
  type Pin,
  type Place,
} from "@/lib/addresses";
import { useAuth } from "@/lib/auth";
import { deliverToAddress, setDeliverTo, useDeliverTo } from "@/lib/deliver-to";
import AddressForm from "./AddressForm";
import "./deliver-to.css";

const MapPin = dynamic(() => import("./MapPin"), { ssr: false });
const db = () => import("@/lib/address-db");

const ASKED_KEY = "bb-address-asked";

type Finding = "idle" | "finding" | "denied" | "failed";

// "Delivering to" in the shop header. Tapping it opens a sheet (a dropdown
// on wide screens): use the phone's location, add an address on the map, or
// pick a saved one. Checkout starts from whatever is picked here.
export default function DeliverTo() {
  const where = useDeliverTo();
  const { status, user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"list" | "map" | "form">("list");
  const [draft, setDraft] = useState<AddressInput | null>(null);
  const [finding, setFinding] = useState<Finding>("idle");
  const [saved, setSaved] = useState<Address[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // where the dropdown goes on wide screens (the sheet lives at the end of
  // <body>: the header's blur would otherwise trap a fixed sheet inside it)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  const locate = (then?: () => void) => {
    if (!("geolocation" in navigator)) return setFinding("failed");
    setFinding("finding");
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {}
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { placeAt } = await import("@/lib/addresses");
          const pin = { lat: coords.latitude, lng: coords.longitude };
          const p = await placeAt(pin);
          if (!p.area) throw new Error("no area");
          setDeliverTo({
            area: p.area,
            line: [p.city !== p.area ? p.city : "", p.pincode]
              .filter(Boolean)
              .join(", "),
            pin,
            city: p.city,
            state: p.state,
            pincode: p.pincode,
          });
          setFinding("idle");
          then?.();
        } catch {
          setFinding("failed");
        }
      },
      (err) =>
        setFinding(err.code === err.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // first visit: ask for the location once on its own
  useEffect(() => {
    let asked = false;
    try {
      asked =
        localStorage.getItem(ASKED_KEY) === "1" ||
        !!localStorage.getItem("bb-address");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asking for the location once, on arrival
    if (!asked) locate();
  }, []);

  // signed in: fetch saved addresses; with nothing picked yet, the default
  useEffect(() => {
    if (!user) return;
    let live = true;
    db()
      .then((m) => m.listAddresses())
      .then((rows) => {
        if (!live) return;
        setSaved(rows);
        setLoadFailed(false);
        if (!where && rows[0]) setDeliverTo(deliverToAddress(rows[0]));
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per user, not per pick
  }, [user]);

  // close on outside tap and Escape; the page stays put under the phone sheet
  useEffect(() => {
    if (!open || step === "map") return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      // the form's own map opens over the page, outside this element
      if (
        !root.current?.contains(t) &&
        !sheet.current?.contains(t) &&
        !t.closest?.(".mp")
      )
        close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    const phone = window.matchMedia("(max-width: 639px)").matches;
    const was = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
      document.body.style.overflow = was;
    };
  }, [open, step]);

  function close() {
    setOpen(false);
    setStep("list");
    setDraft(null);
  }

  function pinned(pin: Pin, place: Place | null) {
    if (user) {
      // signed in: finish the address and keep it
      const start: AddressInput = {
        ...EMPTY_ADDRESS,
        recipient_name: profile?.full_name ?? "",
        phone: profile?.phone ?? "",
      };
      setDraft(withPlace(start, pin, place));
      setStep("form");
      return;
    }
    // guest: deliver to that spot for now
    setDeliverTo({
      area: place?.area || "Pinned location",
      line: [
        place?.street,
        place?.city !== place?.area ? place?.city : "",
        place?.pincode,
      ]
        .filter(Boolean)
        .join(", "),
      pin,
      city: place?.city,
      state: place?.state,
      pincode: place?.pincode,
    });
    close();
  }

  async function saveNew(a: AddressInput) {
    const m = await db();
    const row = await m.saveAddress(
      user!.id,
      saved?.length ? a : { ...a, is_default: true },
    );
    setSaved(await m.listAddresses());
    setDeliverTo(deliverToAddress(row));
    close();
  }

  const label =
    finding === "finding"
      ? "Finding you…"
      : where
        ? where.area
        : finding === "denied"
          ? "Location is off"
          : finding === "failed"
            ? "Couldn't find you"
            : "Set your location";

  return (
    <div ref={root} className="dt">
      <button
        type="button"
        className="sb-where"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Delivering to ${label}${where?.line ? `, ${where.line}` : ""}. Change the delivery location.`}
        onClick={(e) => {
          if (open) return close();
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ top: r.bottom + 10, left: r.left });
          setOpen(true);
        }}
      >
        <span className="sb-where-kicker">Delivering to</span>
        <span className="sb-where-addr">
          <svg
            className="sb-pin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.3" />
          </svg>
          <b>{label}</b>
          {where?.line && <span className="sb-where-line">{where.line}</span>}
          <svg
            className={`sb-caret${open ? " is-open" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 9h12l-6 7z" />
          </svg>
        </span>
      </button>

      {open &&
        step !== "map" &&
        createPortal(
          <>
            <div className="dt-scrim" aria-hidden="true" />
            <div
              ref={sheet}
              className="dt-sheet"
              style={
                anchor
                  ? ({
                      "--dt-top": `${anchor.top}px`,
                      "--dt-left": `${anchor.left}px`,
                    } as React.CSSProperties)
                  : undefined
              }
              role="dialog"
              aria-label={
                step === "form"
                  ? "Add address details"
                  : "Select a delivery location"
              }
            >
              <div className="dt-grab" aria-hidden="true" />
              <div className="dt-head">
                <h2>
                  {step === "form"
                    ? "Address details"
                    : "Select delivery location"}
                </h2>
                <button
                  type="button"
                  className="dt-x"
                  onClick={close}
                  aria-label="Close"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {step === "form" && draft ? (
                <div className="dt-body">
                  <AddressForm
                    initial={draft}
                    showDefault={!!saved?.length}
                    onSave={saveNew}
                    onCancel={() => setStep("list")}
                    saveLabel="Save and deliver here"
                  />
                </div>
              ) : (
                <div className="dt-body">
                  <button
                    type="button"
                    className="dt-row dt-action"
                    onClick={() => locate(close)}
                    disabled={finding === "finding"}
                  >
                    <span className="dt-icon">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      </svg>
                    </span>
                    <span className="dt-text">
                      <b>
                        {finding === "finding"
                          ? "Finding you…"
                          : "Use my current location"}
                      </b>
                      {finding === "denied" && (
                        <small className="dt-warn">
                          Location is off for this site. Turn it on in your
                          browser settings.
                        </small>
                      )}
                      {finding === "failed" && (
                        <small className="dt-warn">
                          We couldn&apos;t find you. Try adding the address on
                          the map.
                        </small>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dt-row dt-action"
                    onClick={() => setStep("map")}
                  >
                    <span className="dt-icon">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="dt-text">
                      <b>Add new address</b>
                      <small>Pin it on the map</small>
                    </span>
                  </button>

                  {status === "in" ? (
                    <>
                      <p className="dt-kicker">Your saved addresses</p>
                      {loadFailed && (
                        <p className="dt-note dt-warn">
                          We couldn&apos;t load your addresses.
                        </p>
                      )}
                      {!saved && !loadFailed && (
                        <p className="dt-note">Loading…</p>
                      )}
                      {saved?.length === 0 && (
                        <p className="dt-note">
                          None yet. Add one above and it&apos;s here next time.
                        </p>
                      )}
                      {saved?.map((a) => {
                        const on = where?.addressId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={`dt-row${on ? " is-on" : ""}`}
                            aria-pressed={on}
                            onClick={() => {
                              setDeliverTo(deliverToAddress(a));
                              close();
                            }}
                          >
                            <span className="dt-icon">
                              <LabelIcon label={a.label} />
                            </span>
                            <span className="dt-text">
                              <b>
                                {a.label}
                                {a.is_default && <em>Default</em>}
                              </b>
                              <small>
                                {[a.line1, shortLine(a)]
                                  .filter(Boolean)
                                  .join(", ")}
                              </small>
                            </span>
                            {on && (
                              <svg
                                className="dt-tick"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                      {!!saved?.length && (
                        <Link
                          href="/account"
                          className="dt-manage"
                          onClick={close}
                        >
                          Manage addresses
                        </Link>
                      )}
                    </>
                  ) : status === "out" ? (
                    <p className="dt-note">
                      <Link href="/account/login" onClick={close}>
                        Log in
                      </Link>{" "}
                      to see your saved addresses.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}

      {open && step === "map" && (
        <MapPin
          start={where?.pin ?? null}
          onConfirm={pinned}
          onClose={() => setStep("list")}
        />
      )}
    </div>
  );
}

function LabelIcon({ label }: { label: string }) {
  const path =
    label === "Home"
      ? "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"
      : label === "Work"
        ? "M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM9 8V5h6v3M4 13h16"
        : "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
