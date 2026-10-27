import type { Metadata } from "next";
import type { ReactNode } from "react";

// Public share pages: never indexed, never leak the URL (token) through Referer.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}
