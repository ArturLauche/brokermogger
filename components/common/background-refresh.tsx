"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Refresh only active work and visible tabs; stop automatically when results arrive. */
export function BackgroundRefresh({
  working,
  message,
}: {
  working: boolean;
  message: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!working) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, 10_000);
    return () => clearInterval(interval);
  }, [working, router]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        {pending ? "Refreshing…" : "Refresh status"}
      </Button>
      {working ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
