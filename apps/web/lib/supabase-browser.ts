"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicAuthConfig } from "./auth-config";

/**
 * The browser's Supabase client, used only for Supabase Auth (sign in, sign up, reset and change
 * password, change email; ADR-039). The password goes from the browser to Supabase and never through
 * RhoeFlow's server. The session lands in cookies the server reads. Data still goes through RhoeFlow's
 * API routes, never from the browser to the database.
 */
let cached: { key: string; client: SupabaseClient } | null = null;

export function browserSupabase(config: PublicAuthConfig): SupabaseClient {
  const key = `${config.url}\u0000${config.anonKey}`;
  if (!cached || cached.key !== key) cached = { key, client: createBrowserClient(config.url, config.anonKey) };
  return cached.client;
}

/** Plain-language messages for Supabase Auth errors the forms can hit. */
export function authMessage(e: { message?: string | undefined; code?: string | undefined } | null | undefined): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "That email and password don't match a RhoeFlow login.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "Confirm your email first: open the link Supabase sent when you made this login.";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "There's already a login for that email. Sign in, or reset the password.";
  if (code === "weak_password" || /password should be/i.test(msg)) return "Pick a longer password: at least 8 characters.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) return "Too many emails were sent just now. Try again in a few minutes.";
  if (code === "same_password") return "That's the password you already have.";
  if (code === "otp_disabled" || code === "email_provider_disabled") return "Emailed codes aren't turned on yet. Sign in with your password for now.";
  if (code === "signup_disabled") return "There's no RhoeFlow login for that email yet. Ask your company's RhoeFlow admin to invite you.";
  if (/error sending .*email/i.test(msg)) return "RhoeFlow can't send email yet. Sign in with your password for now.";
  return msg || "Something went wrong. Try again.";
}

/** Accept pending invites for this login, then go to `next` with a full page load so the server sees the new cookies. */
export async function afterSignIn(next: string): Promise<void> {
  try {
    await fetch("/api/me/invites", { method: "POST", cache: "no-store" });
  } catch {
    // Retried on the next sign-in.
  }
  window.location.assign(next);
}
