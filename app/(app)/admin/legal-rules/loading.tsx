import { PageHeader } from "@/components/common/page-header";
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Legal rules" />
      <p role="status">Loading legal source review work…</p>
    </div>
  );
}
