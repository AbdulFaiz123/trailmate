"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordMatches, safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret, signSession } from "@/lib/auth";

export type LoginState = { error?: string };

/**
 * Secure in production, except over plain http (e.g. `npm start` opened from a
 * phone on the same Wi-Fi), where the browser would silently drop a Secure cookie.
 */
async function secureCookie() {
  if (process.env.NODE_ENV !== "production") return false;
  return (await headers()).get("x-forwarded-proto") !== "http";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = process.env.APP_PASSWORD;
  const secret = sessionSecret();
  if (!password || !secret) return { error: "No APP_PASSWORD is set on the server." };

  const input = String(formData.get("password") ?? "");
  if (!(await passwordMatches(input, password))) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Wrong passphrase." };
  }

  (await cookies()).set(SESSION_COOKIE, await signSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
