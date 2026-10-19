import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trailmate",
  description: "Your whole trip in one place: stays, routes, lists and live alerts.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1311" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="mx-auto min-h-dvh max-w-md">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/90 px-4 py-3 backdrop-blur">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-accent">●</span> Trailmate
            </Link>
          </header>
          <main className="px-4 pb-24 pt-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
