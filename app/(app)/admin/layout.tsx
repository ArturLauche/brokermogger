import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("MAINTAINER");
  return <div className="flex flex-col gap-6">{children}</div>;
}
