// Small shared form building blocks (server- and client-safe: no hooks).

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

export function Field({
  label, hint, error, children, className = "",
}: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : (
        hint && <span className="block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

/** Text input with a dropdown of every IANA time zone. */
export function TimeZoneInput({
  name, defaultValue, zones, onChange,
}: {
  name: string;
  defaultValue?: string;
  zones: string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const listId = `${name}-zones`;
  return (
    <>
      <input name={name} defaultValue={defaultValue} onChange={onChange} list={listId} autoComplete="off" spellCheck={false} className={inputClass} />
      <datalist id={listId}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line bg-surface/50 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
