"use client";
import { Button } from "@/components/ui/button";
export default function ReportsError({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Reports could not be loaded</h1>
      <p>
        Try again to see report progress and downloads. Reports already queued continue in
        the background.
      </p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <a className="underline" href="/reports">
          Open the first page
        </a>
      </p>
    </div>
  );
}
