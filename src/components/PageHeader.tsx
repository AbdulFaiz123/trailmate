import Link from "next/link";

export function PageHeader({ backHref, backLabel, title }: { backHref: string; backLabel: string; title: string }) {
  return (
    <div>
      <Link href={backHref} className="text-xs text-muted">← {backLabel}</Link>
      <h1 className="mt-1 text-xl font-semibold">{title}</h1>
    </div>
  );
}
