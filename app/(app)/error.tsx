"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const path = usePathname();
  return (
    <ErrorState
      headingLevel={1}
      title="This screen could not be loaded"
      description="Try loading it again. Check your request history before repeating an action. If the problem continues, pass the error code to the instance operator."
      errorCode={error.digest ?? "WORKSPACE_LOAD_FAILED"}
      onRetry={reset}
      action={
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={path}>Open without filters</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </div>
      }
    />
  );
}
