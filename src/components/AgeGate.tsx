"use client";

import { useState } from "react";
import { AGE_STORAGE_KEY, MIN_AGE } from "@/lib/config";
import Logo from "./Logo";

// Visibility is driven by html[data-age-ok] (set before paint by the inline
// script in the root layout), so returning visitors never see a flash.
export default function AgeGate() {
  const [denied, setDenied] = useState(false);

  function confirm() {
    try {
      localStorage.setItem(AGE_STORAGE_KEY, "1");
    } catch {
      // Private mode: the gate just shows again next visit.
    }
    document.documentElement.dataset.ageOk = "1";
  }

  return (
    <div
      id="age-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-12 overflow-y-auto bg-char px-6 py-10 text-center"
    >
      <Logo priority className="w-[min(78vw,24rem)]" />

      {denied ? (
        <div className="max-w-[38ch]">
          <h2 id="age-gate-title" className="text-2xl sm:text-3xl">
            Sorry, this site is for adults only
          </h2>
          <p className="mt-3 text-muted">
            You must be {MIN_AGE} or older to enter. Please close this page.
          </p>
        </div>
      ) : (
        <div className="max-w-[42ch]">
          <h2 id="age-gate-title" className="text-2xl sm:text-3xl">
            Are you {MIN_AGE} or older?
          </h2>
          <p className="mt-3 text-muted">
            This shop sells smoking accessories to adults only. We&apos;ll remember your answer on
            this device.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={confirm} autoFocus className="btn btn-primary">
              Yes, I&apos;m {MIN_AGE} or older
            </button>
            <button type="button" onClick={() => setDenied(true)} className="btn btn-ghost">
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
