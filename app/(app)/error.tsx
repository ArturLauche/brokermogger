"use client";

import Link from "next/link";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      headingLevel={1}
      title="This screen could not be loaded"
      description="Try loading it again. Check your request history before repeating an action. If the problem continues, pass the error code to the instance operator."
      errorCode={error.digest ?? "WORKSPACE_LOAD_FAILED"}
      onRetry={reset}
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
      }
    />
  );
}
