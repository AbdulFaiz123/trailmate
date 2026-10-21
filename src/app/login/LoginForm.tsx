"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Field, inputClass } from "@/components/form";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Passphrase" error={state.error}>
        <input name="password" type="password" autoComplete="current-password" required autoFocus className={inputClass} />
      </Field>
      <button
        disabled={pending}
        className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:text-[#04201c]"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
