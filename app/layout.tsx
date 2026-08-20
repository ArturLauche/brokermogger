import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Brokermogger",
    template: "%s | Brokermogger",
  },
  applicationName: "Brokermogger",
  description:
    "Open source privacy request desk for preparing, approving, sending and tracking data broker privacy requests.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "Brokermogger",
    title: "Brokermogger",
    description:
      "Prepare, approve and track your own privacy requests. Free, open source and self hostable.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" closeButton richColors />
      </body>
    </html>
  );
}
