import { PageHeader } from "@/components/common/page-header";
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Brokers" />
      <p role="status">Loading broker review work…</p>
    </div>
  );
}
