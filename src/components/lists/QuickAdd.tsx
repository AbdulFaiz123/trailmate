"use client";

import { useRef } from "react";

/** Sticky one-line "add item" bar. Supports "3x Haribo" for quantity. */
export function QuickAdd({ action, list, newHref }: {
  action: (formData: FormData) => Promise<void>; list: "BUY" | "PACK"; newHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          formRef.current?.reset();
        }}
        className="flex gap-2"
      >
        <input
          name="name"
          required
          autoComplete="off"
          placeholder={list === "BUY" ? "Add to buy… e.g. 3x Haribo" : "Add to pack…"}
          aria-label={list === "BUY" ? "Add an item to buy" : "Add an item to pack"}
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-full bg-accent px-5 text-sm font-semibold text-white dark:text-[#04201c]">Add</button>
        <a href={newHref} aria-label="Add with details" className="flex items-center rounded-full border border-line px-3 text-sm text-muted">⋯</a>
      </form>
    </div>
  );
}
