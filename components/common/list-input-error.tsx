import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ListInputErrorPage({ title, path }: { title: string; path: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <Alert variant="destructive">
        <AlertTitle>These filters or page links are invalid</AlertTitle>
        <AlertDescription>
          Open the first page to choose new filters. Your saved records are unchanged.
        </AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="self-start">
        <Link href={path}>Reset filters and open first page</Link>
      </Button>
    </div>
  );
}
