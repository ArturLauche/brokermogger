"use client";
import { Button } from "@/components/ui/button";
export default function ExportsError({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Account exports could not be loaded</h1>
      <p>Try again to see progress and available copies.</p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <a href="/settings/privacy/exports" className="underline">
          Open the first page
        </a>
      </p>
    </div>
  );
}
