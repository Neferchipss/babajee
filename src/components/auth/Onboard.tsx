"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ageOf, readDob } from "@/lib/age";
import { useAuth } from "@/lib/auth";
import { MIN_AGE } from "@/lib/config";
import { BASE_PATH } from "@/lib/site";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import NotConnected from "./NotConnected";
import "./onboard.css";

// One way in for everyone (0058): type your email, enter the code we send
// (that verifies the email), and a new customer adds name, mobile and date of
// birth on one short screen. Customers who set a password before can still use
// it. Wide screens get a brand panel beside the form (art comes later: the
// dashed boxes are placeholders); phones get a short banner and a button that
// sits at the bottom of the screen.
type Step = "email" | "code" | "password" | "details";
const RESEND_AFTER = 30;
const codeOk = (c: string) => /^\d{6,8}$/.test(c);

export default function Onboard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  // the details step
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState({ d: "", m: "", y: "" });
  const codeRef = useRef<HTMLInputElement>(null);

  // the resend countdown
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // already signed in: straight on, or to the details still missing
  const incomplete = status === "in" && profile && (!profile.full_name.trim() || !profile.date_of_birth || !profile.phone.trim());
  const [shownDetails, setShownDetails] = useState(false);
  if (incomplete && !shownDetails) {
    setShownDetails(true);
    setStep("details");
    setName(profile.full_name);
    setPhone(profile.phone.replace(/^\+91\s?/, ""));
  }
  useEffect(() => {
    if (status === "in" && profile && !incomplete) router.replace(next);
  }, [status, profile, incomplete, next, router]);

  if (!supabaseConfigured) return <NotConnected />;

  const sb = () => getSupabase()!;

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const to = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setErr("Enter your email address, like you@example.com.");
    setBusy(true);
    setErr("");
    // the email carries a link today (the code shows once the login emails go
    // through Resend, tools/auth_emails.py); the link brings them back here
    const returnTo = `${window.location.origin}${BASE_PATH}/account/login/?next=${encodeURIComponent(next)}`;
    const { error } = await sb().auth.signInWithOtp({ email: to, options: { shouldCreateUser: true, emailRedirectTo: returnTo } });
    setBusy(false);
    if (error) return setErr(error.status === 429 ? "Too many codes asked for. Wait a few minutes and try again." : !error.status ? "We couldn't reach the shop. Check your connection." : error.message);
    setEmail(to);
    setCode("");
    setStep("code");
    setWait(RESEND_AFTER);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!codeOk(code)) return setErr("Enter the code from the email.");
    setBusy(true);
    setErr("");
    const { error } = await sb().auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) return setErr(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check it, or send a new one." : error.message);
    await refreshProfile();
    // the effect above moves on, or the details step shows
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const c = "code" in error ? error.code : undefined;
      if (error.status) void sb().rpc("log_failed_login", { p_email: email.trim(), p_reason: c === "invalid_credentials" ? "Wrong email or password" : (c ?? "Other"), p_user_agent: navigator.userAgent }).then(() => {});
      return setErr(c === "invalid_credentials" ? "That email and password don't match." : c === "email_not_confirmed" ? "This email isn't verified yet. Use a code instead." : error.message);
    }
    await refreshProfile();
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Enter your name.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return setErr("Enter your 10-digit mobile number.");
    let born: string | null = profile?.date_of_birth ?? null;
    if (!born) {
      const r = readDob(dob.d, dob.m, dob.y);
      if ("error" in r) return setErr(r.error);
      if ((ageOf(r.dob) ?? 0) < MIN_AGE) return setErr("Babajee is for adults only: you must be 18 or older.");
      born = r.dob;
    }
    setBusy(true);
    setErr("");
    const { error } = await sb().rpc("complete_profile", { p_name: name.trim(), p_phone: `+91 ${digits}`, p_dob: born });
    setBusy(false);
    if (error) return setErr(error.message);
    await refreshProfile();
  }

  const back = (to: Step) => () => {
    setErr("");
    setStep(to);
  };

  return (
    <div className="onb">
      {/* the brand side: art comes later, the dashed box marks its place */}
      <aside className="onb-brand" aria-hidden="true">
        <div className="onb-art">
          <span>Hero art</span>
        </div>
        <div className="onb-pitch">
          <h2>Everything for the session, at your door.</h2>
          <ul>
            <li>
              <i>18+</i> Adults only, checked once at sign-up
            </li>
            <li>
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" />
                  <circle cx="7" cy="18" r="1.6" />
                  <circle cx="17" cy="18" r="1.6" />
                </svg>
              </i>
              Delivered across India
            </li>
            <li>
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                </svg>
              </i>
              Discreet packaging, no labels outside
            </li>
          </ul>
        </div>
      </aside>

      <section className="onb-card" aria-live="polite">
        {step === "email" && (
          <form onSubmit={sendCode} className="onb-form">
            <div className="onb-head">
              <h1>Log in or sign up</h1>
              <p>We&apos;ll email you a code. No password needed.</p>
            </div>
            <label className="onb-field">
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            {err && <p className="onb-err" role="alert">{err}</p>}
            <div className="onb-actions">
              <button className="onb-btn" disabled={busy || !email.trim()}>
                {busy ? "Sending the code" : "Continue"}
              </button>
              <button type="button" className="onb-link" onClick={back("password")}>
                Use a password instead
              </button>
            </div>
            <p className="onb-fine">
              By continuing you confirm you&apos;re 18 or older and agree to our <Link href="/terms">terms</Link> and <Link href="/legal">privacy policy</Link>.
            </p>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verify} className="onb-form">
            <button type="button" className="onb-back" onClick={back("email")} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="onb-head">
              <h1>Check your email</h1>
              <p>
                Tap the link we sent to <b>{email}</b>, or enter the code if the email shows one.{" "}
                <button type="button" className="onb-link" onClick={back("email")}>
                  Change
                </button>
              </p>
            </div>
            {/* one real input under the boxes: paste, autofill and the keyboard all work */}
            <label className="onb-code" onClick={() => codeRef.current?.focus()}>
              <span className="sr-only">The code from the email</span>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              />
              <span className="onb-slots" aria-hidden="true">
                {Array.from({ length: Math.max(6, code.length) }, (_, i) => (
                  <i key={i} className={i === code.length ? "is-at" : code[i] ? "is-full" : ""}>
                    {code[i] ?? ""}
                  </i>
                ))}
              </span>
            </label>
            {err && <p className="onb-err" role="alert">{err}</p>}
            <div className="onb-actions">
              <button className="onb-btn" disabled={busy || !codeOk(code)}>
                {busy ? "Checking" : "Verify and continue"}
              </button>
              <button type="button" className="onb-link" disabled={wait > 0 || busy} onClick={() => sendCode()}>
                {wait > 0 ? `Send a new code in 0:${String(wait).padStart(2, "0")}` : "Send a new code"}
              </button>
            </div>
            <p className="onb-fine">Open the link on this phone or computer. Not there? Check spam or promotions; it works for an hour.</p>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={withPassword} className="onb-form">
            <button type="button" className="onb-back" onClick={back("email")} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="onb-head">
              <h1>Log in with a password</h1>
              <p>For accounts that set one before.</p>
            </div>
            <label className="onb-field">
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="onb-field">
              <span>Password</span>
              <span className="onb-pw">
                <input type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {err && <p className="onb-err" role="alert">{err}</p>}
            <div className="onb-actions">
              <button className="onb-btn" disabled={busy || !email.trim() || !password}>
                {busy ? "Logging in" : "Log in"}
              </button>
              <Link href="/account/reset" className="onb-link">
                Forgot your password?
              </Link>
            </div>
          </form>
        )}

        {step === "details" && (
          <form onSubmit={saveDetails} className="onb-form">
            <div className="onb-head">
              <p className="onb-step">Email verified</p>
              <h1>A few details</h1>
              <p>So we know who to deliver to. You only do this once.</p>
            </div>
            <label className="onb-field">
              <span>Full name</span>
              <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As on your ID" />
            </label>
            <label className="onb-field">
              <span>Mobile number</span>
              <span className="onb-phone">
                <b>+91</b>
                <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))} placeholder="98201 45566" />
              </span>
            </label>
            {!profile?.date_of_birth && (
              <fieldset className="onb-field">
                <legend>Date of birth</legend>
                <span className="onb-dob">
                  <input inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Day" value={dob.d} onChange={(e) => setDob({ ...dob, d: e.target.value.replace(/\D/g, "") })} />
                  <input inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Month" value={dob.m} onChange={(e) => setDob({ ...dob, m: e.target.value.replace(/\D/g, "") })} />
                  <input inputMode="numeric" maxLength={4} placeholder="YYYY" aria-label="Year" value={dob.y} onChange={(e) => setDob({ ...dob, y: e.target.value.replace(/\D/g, "") })} />
                </span>
                <small>You must be 18 or older. It can&apos;t be changed later.</small>
              </fieldset>
            )}
            {err && <p className="onb-err" role="alert">{err}</p>}
            <div className="onb-actions">
              <button className="onb-btn" disabled={busy}>
                {busy ? "Saving" : "Start shopping"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

// where to go after: a path on this site only
function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/account";
}
