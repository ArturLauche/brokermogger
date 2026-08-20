import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import {
  CardSkeleton,
  ListSkeleton,
  LoadingState,
  TableSkeleton,
} from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";

describe("PageHeader", () => {
  it("renders exactly one h1 plus the optional slots", () => {
    render(
      <PageHeader
        title="Requests"
        description="Everything you prepared, approved or sent."
        breadcrumb={<nav aria-label="Breadcrumb">Dashboard</nav>}
        actions={<Button type="button">Start new removal workflow</Button>}
      />
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Requests");
    expect(
      screen.getByText("Everything you prepared, approved or sent.")
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start new removal workflow" })
    ).toBeInTheDocument();
  });

  it("exposes the heading id when another element references it", () => {
    render(<PageHeader title="Data vault" headingId="vault-heading" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "vault-heading"
    );
  });
});

describe("EmptyState", () => {
  it("hides the decorative icon and renders both actions", () => {
    const { container } = render(
      <EmptyState
        icon={InboxIcon}
        title="No requests yet"
        description="Pick a broker to prepare your first request."
        action={<Button type="button">Choose brokers</Button>}
        secondaryAction={<a href="/brokers">Browse the directory</a>}
      />
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "No requests yet" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose brokers" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse the directory" })
    ).toBeInTheDocument();
    expect(
      container.querySelector("svg")?.closest("[aria-hidden='true']")
    ).not.toBeNull();
  });

  it("uses the requested heading level", () => {
    render(
      <EmptyState
        icon={InboxIcon}
        title="Nothing to review"
        description="Approved requests appear here."
        headingLevel={2}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Nothing to review" })
    ).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("announces itself, shows the error code and retries", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        description="The request list could not be loaded."
        errorCode="REQUESTS_LOAD_FAILED"
        onRetry={onRetry}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("Error code: REQUESTS_LOAD_FAILED");
    expect(screen.getByText("REQUESTS_LOAD_FAILED").tagName).toBe("CODE");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when no handler is given", () => {
    render(<ErrorState title="Page not found" description="This page does not exist." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("loading placeholders", () => {
  it("announce a specific loading text through role=status", () => {
    render(
      <>
        <LoadingState label="Loading requests" />
        <CardSkeleton label="Loading the summary" />
        <TableSkeleton label="Loading the broker table" rows={2} columns={3} />
        <ListSkeleton label="Loading the history" items={2} />
      </>
    );

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(4);
    expect(screen.getByText("Loading requests")).toBeInTheDocument();
    expect(screen.getByText("Loading the summary")).toBeInTheDocument();
    expect(screen.getByText("Loading the broker table")).toBeInTheDocument();
    expect(screen.getByText("Loading the history")).toBeInTheDocument();
  });
});
