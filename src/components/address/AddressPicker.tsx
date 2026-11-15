"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addressLines, EMPTY_ADDRESS, type Address, type AddressInput } from "@/lib/addresses";
import { useAuth } from "@/lib/auth";
import { deliverToAddress, setDeliverTo, startFrom, useDeliverTo } from "@/lib/deliver-to";
import AddressForm from "./AddressForm";

// The database calls pull in the Supabase client, so load them only for
// someone who is signed in.
const db = () => import("@/lib/address-db");

const ONE_OFF = "one-off";

// Checkout's delivery step. Signed in: the picked address shows on its own
// (the default comes ready picked), with "Change" opening a compact one-line
// list of the others, so many saved addresses don't make a long page. Or add
// one, saving it to the account if wanted.
// Guests type the address in, with a nudge to log in and keep it. Starts
// from what was picked in the header's "Delivering to", and picking here
// updates the header too.
export default function AddressPicker() {
  const { status, user, profile } = useAuth();
  const [list, setList] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState("");
  const [adding, setAdding] = useState(false);
  const [oneOff, setOneOff] = useState<AddressInput | null>(null);
  const [keep, setKeep] = useState(true);
  // the list of saved addresses, folded away behind the picked one
  const [listOpen, setListOpen] = useState(false);
  const where = useDeliverTo();

  useEffect(() => {
    if (!user) return;
    let live = true;
    db()
      .then((m) => m.listAddresses())
      .then((rows) => {
        if (!live) return;
        setList(rows);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [user]);

  if (status === "loading" || (status === "in" && list === null && !failed)) {
    return <p className="text-sm text-muted">Loading your addresses.</p>;
  }

  if (status !== "in" || !user || failed) {
    return (
      <>
        {status === "out" && (
          <p className="mb-5 text-sm text-muted">
            <Link href="/account/login" className="font-medium text-paper underline underline-offset-4">
              Log in
            </Link>{" "}
            to save this address for next time.
          </p>
        )}
        {failed && (
          <p role="alert" className="mb-5 text-sm text-red-soft">
            We could not load your saved addresses. Type the address in below.
          </p>
        )}
        <AddressForm initial={startFrom(where)} showDefault={false} nested />
      </>
    );
  }

  const saved = list ?? [];
  const fresh = startFrom(where, {
    ...EMPTY_ADDRESS,
    recipient_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
  });
  // until something is picked here: the header's pick, else the default
  const current = chosen || saved.find((a) => a.id === where?.addressId)?.id || saved[0]?.id || "";
  const pick = (id: string) => {
    setChosen(id);
    setListOpen(false);
    const a = saved.find((x) => x.id === id);
    if (a) setDeliverTo(deliverToAddress(a));
  };

  async function use(a: AddressInput) {
    if (!keep) {
      setOneOff(a);
      setChosen(ONE_OFF);
      setAdding(false);
      return;
    }
    const m = await db();
    const row = await m.saveAddress(user!.id, saved.length ? a : { ...a, is_default: true });
    setList(await m.listAddresses());
    setChosen(row.id);
    setDeliverTo(deliverToAddress(row));
    setAdding(false);
  }

  const picked = current === ONE_OFF ? oneOff : saved.find((a) => a.id === current);
  const showForm = adding || (!saved.length && !oneOff);

  return (
    <>
      {picked && !listOpen && (
        <div className="rounded-[var(--radius)] border border-rasta-gold bg-iron p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium">
              {picked.label} <span className="font-normal text-muted">· {picked.recipient_name}</span>
            </span>
            {saved.length + (oneOff ? 1 : 0) > 1 && (
              <button type="button" className="shrink-0 text-sm font-semibold text-rasta-gold underline underline-offset-4" aria-expanded={false} onClick={() => setListOpen(true)}>
                Change · {saved.length + (oneOff ? 1 : 0)} saved
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {addressLines(picked).map((l) => (
              <span key={l} className="block break-words">
                {l}
              </span>
            ))}
            <span className="block">{picked.phone}</span>
          </p>
        </div>
      )}

      {(listOpen || (!picked && (saved.length > 0 || oneOff))) && (
        <fieldset className="overflow-hidden rounded-[var(--radius)] border border-line">
          <legend className="sr-only">Choose a delivery address</legend>
          {saved.map((a) => (
            <Choice key={a.id} id={a.id} a={a} chosen={current} onPick={pick} badge={a.is_default ? "Default" : ""} />
          ))}
          {oneOff && <Choice id={ONE_OFF} a={oneOff} chosen={current} onPick={pick} badge="This order only" />}
        </fieldset>
      )}

      {showForm ? (
        <div className={saved.length || oneOff ? "mt-4 rounded-[var(--radius)] border border-line p-4 sm:p-5" : ""}>
          {(saved.length > 0 || oneOff) && <p className="mb-4 font-medium">New address</p>}
          <AddressForm
            initial={fresh}
            nested
            startWithMap
            showDefault={false}
            onSave={use}
            onCancel={saved.length || oneOff ? () => setAdding(false) : undefined}
            saveLabel="Deliver here"
          >
            <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-rasta-gold)]"
                checked={keep}
                onChange={(e) => setKeep(e.target.checked)}
              />
              <span>Save to my addresses</span>
            </label>
          </AddressForm>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-x-6 text-sm">
          {listOpen && (
            <button type="button" className="min-h-11 text-muted underline underline-offset-4 hover:text-paper" onClick={() => setListOpen(false)}>
              Keep this one
            </button>
          )}
          <button type="button" className="min-h-11 underline underline-offset-4 hover:text-paper" onClick={() => setAdding(true)}>
            Deliver somewhere else
          </button>
          <Link href="/account" className="flex min-h-11 items-center text-muted underline underline-offset-4 hover:text-paper">
            Manage addresses
          </Link>
        </div>
      )}

      {/* what the order will be sent to, for when the form is submitted */}
      {picked &&
        (["recipient_name", "phone", "line1", "line2", "landmark", "city", "state", "pincode", "latitude", "longitude"] as const).map((k) => (
          <input key={k} type="hidden" name={`address_${k}`} value={picked[k] ?? ""} />
        ))}
    </>
  );
}

function Choice({
  id,
  a,
  chosen,
  onPick,
  badge,
}: {
  id: string;
  a: AddressInput;
  chosen: string;
  onPick: (id: string) => void;
  badge: string;
}) {
  const on = chosen === id;
  const lines = addressLines(a);
  return (
    <label className={`flex min-h-14 cursor-pointer items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 ${on ? "bg-iron" : "hover:bg-iron/60"}`}>
      <input type="radio" name="address_choice" className="size-4 shrink-0 accent-[var(--color-rasta-gold)]" checked={on} onChange={() => onPick(id)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">
            {a.label} <span className="font-normal text-muted">· {a.recipient_name}</span>
          </span>
          {badge && <span className="shrink-0 text-xs font-semibold text-rasta-gold">{badge}</span>}
        </span>
        <span className="block truncate text-xs text-muted">{[lines[0], lines[lines.length - 1]].filter((l, i, all) => l && all.indexOf(l) === i).join(", ")}</span>
      </span>
    </label>
  );
}
