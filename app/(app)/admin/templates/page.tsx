import { PageHeader } from "@/components/common/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminTemplates } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Admin templates" };

export default async function AdminTemplatesPage() {
  const actor = await requireRole("MAINTAINER");
  const templates = await getAdminTemplates(actor);

  return (
    <>
      <PageHeader
        title="Templates"
        description="Subject and body use only placeholders from lib/templates/variables.ts. Unknown variables fail rendering."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Jurisdiction</TableHead>
            <TableHead>Latest version</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => {
            const latest = template.versions[0];
            return (
              <TableRow key={template.id}>
                <TableCell>{template.name}</TableCell>
                <TableCell>{template.requestType}</TableCell>
                <TableCell>{template.jurisdiction?.code ?? "generic"}</TableCell>
                <TableCell>
                  {latest ? `v${latest.version} ${latest.status}` : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
