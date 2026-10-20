"use client";

export function DeleteButton({ action, what }: { action: () => Promise<void>; what: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete this ${what}? This can't be undone.`)) e.preventDefault();
      }}
    >
      <button type="submit" className="w-full rounded-full border border-red-300 py-3 text-sm font-medium text-red-600 dark:border-red-900 dark:text-red-400">
        Delete {what}
      </button>
    </form>
  );
}
