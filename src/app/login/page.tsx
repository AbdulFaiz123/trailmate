import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext, SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const secret = sessionSecret();

  if (!secret) {
    return (
      <div className="space-y-3 py-10 text-center">
        <h1 className="text-xl font-semibold">No passphrase set</h1>
        <p className="text-sm text-muted">
          Set <code>APP_PASSWORD</code> in <code>.env</code> and restart the server.
          {process.env.NODE_ENV !== "production" && " Until then the app is open to anyone who can reach it (development only)."}
        </p>
      </div>
    );
  }
  if (await verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret)) redirect(next);

  return (
    <div className="space-y-4 py-10">
      <h1 className="text-xl font-semibold">Log in</h1>
      <LoginForm next={next} />
    </div>
  );
}
