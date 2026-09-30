"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircleIcon } from "lucide-react";

/** Render inside a Next Link so navigation stays visible without streaming a premature HTTP 200. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" className="ml-auto inline-flex shrink-0 items-center">
      <LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      <span className="sr-only">Loading screen</span>
    </span>
  );
}
