"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteAddress, listAddresses, makeDefault, saveAddress } from "@/lib/address-db";
import { addressLines, EMPTY_ADDRESS, type Address, type AddressInput } from "@/lib/addresses";
import { useAuth } from "@/lib/auth";
import AddressForm from "./AddressForm";

// "Saved addresses" on the account page: add, edit, remove, pick the default.
export default function AddressBook() {
  const { user, profile } = useAuth();
  const [list, setList] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  // "new", an address id being edited, or null
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await listAddresses());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    listAddresses()
      .then((rows) => live && setList(rows))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [user]);

  if (!user) return null;

  async function save(a: AddressInput, id?: string) {
    // the first address is the default whether ticked or not
    await saveAddress(user!.id, list?.length ? a : { ...a, is_default: true }, id);
    setEditing(null);
    await load();
  }

  async function act(id: string, run: () => Promise<void>) {
    setBusy(id);
    try {
      await run();
      await load();
    } catch {
      setFailed(true);
    }
    setBusy("");
  }

  const fresh: AddressInput = {
    ...EMPTY_ADDRESS,
    recipient_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
  };

  return (
    <section aria-labelledby="addresses-heading" className="border-t border-line pt-8">
      <h2 id="addresses-heading" className="mb-1 text-2xl">
        Saved addresses
      </h2>
      <p className="mb-6 text-sm text-muted">Pick one at checkout instead of typing it again.</p>

      {failed && (
        <p role="alert" className="mb-4 text-sm text-red-soft">
          We could not load your addresses.{" "}
          <button type="button" className="underline underline-offset-4" onClick={load}>
            Try again
          </button>
        </p>
      )}

      {list === null && !failed && <p className="text-sm text-muted">Loading addresses.</p>}

      {list && (
        <ul className="grid gap-3">
          {list.map((a) =>
            editing === a.id ? (
              <li key={a.id} className="rounded-xl border border-line bg-iron p-4 sm:p-5">
                <AddressForm
                  initial={a}
                  onSave={(next) => save(next, a.id)}
                  onCancel={() => setEditing(null)}
                  showDefault={!a.is_default}
                />
              </li>
            ) : (
              <li
                key={a.id}
                className={`rounded-xl border bg-iron p-4 sm:p-5 ${a.is_default ? "border-rasta-gold/60" : "border-line"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{a.recipient_name}</p>
                  {a.is_default && (
                    <span className="rounded-full bg-rasta-gold px-2 py-0.5 text-xs font-semibold text-ink">
                      Default
                    </span>
                  )}
                </div>
                <address className="mt-1 text-sm not-italic text-muted">
                  {addressLines(a).map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                  <span className="block">{a.phone}</span>
                </address>
                <div className="mt-3 flex flex-wrap gap-x-5 text-sm">
                  <button
                    type="button"
                    className="min-h-11 underline underline-offset-4 hover:text-paper"
                    onClick={() => setEditing(a.id)}
                    disabled={!!busy}
                  >
                    Edit
                  </button>
                  {!a.is_default && (
                    <button
                      type="button"
                      className="min-h-11 underline underline-offset-4 hover:text-paper"
                      onClick={() => act(a.id, () => makeDefault(a.id))}
                      disabled={!!busy}
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-11 text-muted underline underline-offset-4 hover:text-red-soft"
                    onClick={() => {
                      if (!window.confirm("Remove this address?")) return;
                      const heir = a.is_default ? list.find((o) => o.id !== a.id) : undefined;
                      act(a.id, async () => {
                        await deleteAddress(a.id);
                        if (heir) await makeDefault(heir.id);
                      });
                    }}
                    disabled={!!busy}
                  >
                    {busy === a.id ? "Working" : "Remove"}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {list &&
        (editing === "new" ? (
          <div className="mt-3 rounded-xl border border-line bg-iron p-4 sm:p-5">
            <AddressForm
              initial={fresh}
              onSave={(a) => save(a)}
              onCancel={() => setEditing(null)}
              showDefault={list.length > 0}
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost mt-4 w-full sm:w-auto"
            onClick={() => setEditing("new")}
          >
            {list.length ? "Add another address" : "Add an address"}
          </button>
        ))}
    </section>
  );
}
