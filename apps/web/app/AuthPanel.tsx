"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createDataClient, type DataClient } from "@dib/data-client";

type SessionState = { userId: string | null; email: string | null } | null;

/**
 * Auth block for the landing page. Uses the anon key only (public by
 * design); never reads or displays any secret, and never logs payload
 * contents. Errors surface as typed {data, error} results from
 * @dib/data-client — never raw SDK throws.
 */
export default function AuthPanel() {
  const [client, setClient] = useState<DataClient | null>(null);
  const [session, setSession] = useState<SessionState>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || anonKey.startsWith("paste-")) {
      setNotice(
        "Sign-in is not configured yet (missing Supabase URL or anon key)."
      );
      return;
    }
    let unsub: (() => void) | null = null;
    try {
      const c = createDataClient({ supabaseUrl, supabaseAnonKey: anonKey });
      setClient(c);
      void c.auth.getSession().then(({ data }) => {
        if (data) setSession(data.session);
      });
      const res = c.auth.onAuthChange((_event, next) => {
        setSession(next);
      });
      if (res.data) unsub = res.data.unsubscribe;
    } catch {
      setNotice("Sign-in could not start. Check the Supabase configuration.");
    }
    return () => {
      unsub?.();
    };
  }, []);

  async function sendMagicLink() {
    if (!client || !email.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    // Supabase redirects back to this app after the email link is clicked;
    // the redirect URL (this origin) must be whitelisted in the dashboard.
    const { error } = await client.auth.signInWithEmailOtp(email.trim());
    setBusy(false);
    setNotice(
      error
        ? `Could not send the link: ${error.message}`
        : "Check your email — the sign-in link is on its way. It signs you in right here when clicked."
    );
    if (!error) setEmail("");
  }

  async function signOut() {
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    setBusy(false);
    setSession(null);
  }

  if (session?.email) {
    return (
      <div className="flex flex-col sm:flex-row items-stretch gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
        <div className="flex-1 text-sm leading-6">
          <p className="font-medium">Signed in{session.email ? ` as ${session.email}` : ""}.</p>
          <p className="text-zinc-500 dark:text-zinc-400">
            Your saved reports are in the{" "}
            <Link href="/simulator" className="underline">simulator</Link>.
          </p>
        </div>
        <button
          onClick={signOut}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm text-left">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void sendMagicLink();
          }}
          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/60"
          aria-label="Email address for sign-in link"
        />
        <button
          onClick={() => void sendMagicLink()}
          disabled={busy || !email.trim()}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </div>
      {notice ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
