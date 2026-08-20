import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminBrokers } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";

import { updateBrokerAction } from "../actions";

export const metadata = { title: "Admin brokers" };

export default async function AdminBrokersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const brokers = await getAdminBrokers(actor);
  const { error } = await searchParams;

  return (
    <>
      <PageHeader
        title="Brokers"
        description="Demo records cannot enable production sending until verification preconditions pass."
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Production sending could not be enabled</AlertTitle>
          <AlertDescription>
            The broker needs an active verified contact, a source URL, last verified date,
            and must not be flagged unsafe or demo-blocked by the database check.
          </AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Verification</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead>Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {brokers.map((broker) => (
            <TableRow key={broker.id}>
              <TableCell>
                {broker.legalName}
                {broker.isDemoData ? <Badge variant="outline">Demo</Badge> : null}
              </TableCell>
              <TableCell>
                <StatusBadge
                  kind="brokerVerification"
                  status={broker.verificationStatus}
                />
              </TableCell>
              <TableCell>
                {broker.productionSendingEnabled ? "Sending on" : "Sending off"}
              </TableCell>
              <TableCell>
                <form
                  action={updateBrokerAction}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="brokerId" value={broker.id} />
                  <select
                    name="verificationStatus"
                    defaultValue={broker.verificationStatus}
                    className="h-8 rounded-md border border-input px-2 text-sm"
                  >
                    <option value="UNVERIFIED">Unverified</option>
                    <option value="SOURCE_FOUND">Source found</option>
                    <option value="CONTACT_VERIFIED">Contact verified</option>
                    <option value="REQUEST_METHOD_VERIFIED">
                      Request method verified
                    </option>
                    <option value="RESPONSE_BEHAVIOR_VERIFIED">
                      Response behaviour verified
                    </option>
                    <option value="DEPRECATED">Deprecated</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      name="productionSendingEnabled"
                      defaultChecked={broker.productionSendingEnabled}
                    />
                    Production sending
                  </label>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
