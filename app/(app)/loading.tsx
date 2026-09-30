import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/common/loading-state";

export default function WorkspaceLoading() {
  return (
    <>
      <PageHeader title="Loading your workspace" />
      <LoadingState label="Loading the current screen" />
    </>
  );
}
