import type { Connection } from "@/lib/checks";
import { formatDuration } from "@/lib/time";

/** The little "↓ 11 min transfer" line drawn between two connected legs. */
export function ConnectionLine({ connection }: { connection: Connection }) {
  const { status, transferMin, reason } = connection;
  const tone =
    status === "BROKEN"
      ? "text-red-600 dark:text-red-400"
      : status === "TIGHT"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted";
  const label =
    transferMin < 0 ? `${formatDuration(-transferMin)} overlap` : `${formatDuration(transferMin)} transfer`;
  return (
    <div className={`flex items-center gap-2 py-1 pl-5 text-xs ${tone}`}>
      <span aria-hidden className="h-5 border-l-2 border-dashed border-current opacity-60" />
      <span className="font-medium">{label}</span>
      {status !== "OK" && (
        <span>
          · {status === "BROKEN" ? "Missed" : "Tight"}
          {reason ? ` (${reason})` : ""}
        </span>
      )}
    </div>
  );
}
