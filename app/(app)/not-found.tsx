import Link from "next/link";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <ErrorState
      headingLevel={1}
      title="This item is unavailable"
      description="The address is wrong, the item was removed, or it is outside your account. Return to the dashboard to find your records."
      errorCode="NOT_FOUND"
      action={
        <Button asChild>
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
      }
    />
  );
}
