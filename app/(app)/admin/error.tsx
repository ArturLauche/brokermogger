"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Administration could not be loaded</h1>
      <p>Try again to load the current configuration.</p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <a href="/admin" className="underline">
          Return to administration
        </a>
      </p>
    </div>
  );
}
