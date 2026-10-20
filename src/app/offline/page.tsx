import Link from "next/link";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="space-y-3 py-10 text-center">
      <p className="text-4xl" aria-hidden>📴</p>
      <h1 className="text-xl font-semibold">You’re offline</h1>
      <p className="text-sm text-muted">
        This page wasn’t saved on this device yet. Trips you’ve opened while online — with their lists and documents — still work.
      </p>
      <Link href="/" className="inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white dark:text-[#04201c]">
        Go to my trips
      </Link>
    </div>
  );
}
