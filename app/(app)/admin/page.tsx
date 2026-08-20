import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { openAdminConsole } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Admin" };

export default async function AdminHomePage() {
  const actor = await requireRole("MAINTAINER");
  const counts = await openAdminConsole(actor);
  const isAdmin = actor.role === "INSTANCE_ADMIN";

  return (
    <>
      <PageHeader
        title="Admin"
        description="Instance operations. Sensitive user data needs a break-glass grant."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unverified brokers" value={counts.unverifiedBrokers} />
        <StatCard label="Unpublished rule drafts" value={counts.unpublishedRuleDrafts} />
        <StatCard label="Failed jobs" value={counts.failedJobs} />
        <StatCard label="Pending manual reviews" value={counts.pendingManualReviews} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminLink
          href="/admin/brokers"
          title="Brokers"
          body="Directory, verification and production sending."
        />
        <AdminLink
          href="/admin/legal-rules"
          title="Legal rules"
          body="Versioned rules. Published versions are never overwritten."
        />
        <AdminLink
          href="/admin/templates"
          title="Templates"
          body="Request templates with known variables only."
        />
        {isAdmin ? (
          <>
            <AdminLink
              href="/admin/jobs"
              title="Jobs"
              body="PostgreSQL job queue. Retry or cancel."
            />
            <AdminLink
              href="/admin/audit"
              title="Audit"
              body="Hash-chained audit trail and break-glass grants."
            />
          </>
        ) : null}
      </div>
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Fair use</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Limits are operational settings, not paid upgrades. Defaults: 25 requests per
            day and 200 per month.
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function AdminLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link className="underline" href={href}>
            {title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
    </Card>
  );
}
