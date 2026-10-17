import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
<<<<<<< HEAD
  title: "Patient Intake | ConsultPrep AI",
  description: "Organize information to discuss with a healthcare professional.",
=======
  title: "ConsultPrep AI | Prepare for your consultation",
  description:
    "A frontend preview of an information-gathering aid for preparing for a healthcare consultation. It does not diagnose or prescribe.",
  icons: {
    icon: "/consultprep-mark.svg",
  },
>>>>>>> 4dbf67034c24251e0552d9a76b7cbd3d49f1d0af
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-surface px-4 py-2 text-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:outline-3 focus:outline-offset-2 focus:outline-focus"
        >
          Skip to main content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-md font-semibold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
              aria-label="ConsultPrep AI, introduction"
            >
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-contrast">
                C
              </span>
              <span>ConsultPrep AI</span>
            </Link>
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted sm:block">
              Frontend preview
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
