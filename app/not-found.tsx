import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/common/error-state";
import { InstancePublicFooter } from "@/components/layout/instance-public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-16 focus:outline-none"
      >
        <ErrorState
          className="w-full"
          headingLevel={1}
          title="This page does not exist"
          description="The address is wrong, or the page has been removed. If you followed a link inside the product, the item may have been deleted."
          errorCode="NOT_FOUND"
          action={
            <Button asChild>
              <Link href="/">Go to the start page</Link>
            </Button>
          }
        />
      </main>
      <InstancePublicFooter />
    </>
  );
}
