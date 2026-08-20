import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BROKER_VERIFICATION_STATUS_LABELS,
  CONSENT_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  StatusBadge,
} from "@/components/common/status-badge";

/**
 * Mirrors prisma/schema.prisma. If an enum grows, this list has to grow with
 * it, which is exactly the reminder we want when a new status appears.
 */
const REQUEST_STATUSES = [
  "DRAFT",
  "PREPARED",
  "AWAITING_USER_APPROVAL",
  "APPROVED",
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "BROKER_REQUESTED_VERIFICATION",
  "NEEDS_USER_ACTION",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_SENT",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "REJECTED",
  "NO_RESPONSE",
  "ESCALATION_RECOMMENDED",
  "MANUAL_REVIEW_REQUIRED",
  "CLOSED",
  "FAILED",
] as const;

const CONSENT_STATUSES = [
  "SELF",
  "GUARDIAN_MANAGED",
  "EXPLICIT_CONSENT_OBTAINED",
  "PENDING_CONSENT",
  "NOT_ALLOWED",
] as const;

const BROKER_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "SOURCE_FOUND",
  "CONTACT_VERIFIED",
  "REQUEST_METHOD_VERIFIED",
  "RESPONSE_BEHAVIOR_VERIFIED",
  "DEPRECATED",
  "INACTIVE",
] as const;

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] as const;

describe("StatusBadge", () => {
  it("covers every status of every mapped enum", () => {
    expect(Object.keys(REQUEST_STATUS_LABELS).sort()).toEqual(
      [...REQUEST_STATUSES].sort()
    );
    expect(Object.keys(CONSENT_STATUS_LABELS).sort()).toEqual(
      [...CONSENT_STATUSES].sort()
    );
    expect(Object.keys(BROKER_VERIFICATION_STATUS_LABELS).sort()).toEqual(
      [...BROKER_VERIFICATION_STATUSES].sort()
    );
    expect(Object.keys(RISK_LEVEL_LABELS).sort()).toEqual([...RISK_LEVELS].sort());
  });

  it.each(REQUEST_STATUSES)(
    "renders readable text for the request status %s",
    (status) => {
      const { container } = render(<StatusBadge kind="request" status={status} />);

      const label = REQUEST_STATUS_LABELS[status];
      expect(label.length).toBeGreaterThan(0);
      expect(screen.getByText(label)).toBeInTheDocument();
      // The tone icon carries the meaning a second time, so colour is never the
      // only signal.
      expect(container.querySelector("svg")).not.toBeNull();
    }
  );

  it.each(CONSENT_STATUSES)(
    "renders readable text for the consent status %s",
    (status) => {
      render(<StatusBadge kind="consent" status={status} />);
      expect(screen.getByText(CONSENT_STATUS_LABELS[status])).toBeInTheDocument();
    }
  );

  it.each(BROKER_VERIFICATION_STATUSES)(
    "renders readable text for the broker verification status %s",
    (status) => {
      render(<StatusBadge kind="brokerVerification" status={status} />);
      expect(
        screen.getByText(BROKER_VERIFICATION_STATUS_LABELS[status])
      ).toBeInTheDocument();
    }
  );

  it.each(RISK_LEVELS)("renders readable text for the risk level %s", (level) => {
    render(<StatusBadge kind="risk" status={level} />);
    expect(screen.getByText(RISK_LEVEL_LABELS[level])).toBeInTheDocument();
  });

  it("gives each tone its own icon", () => {
    const draft = render(<StatusBadge kind="request" status="DRAFT" />);
    const draftIcon = draft.container.querySelector("svg")?.getAttribute("class");
    draft.unmount();

    const completed = render(<StatusBadge kind="request" status="COMPLETED" />);
    const completedIcon = completed.container.querySelector("svg")?.getAttribute("class");

    expect(draftIcon).not.toEqual(completedIcon);
  });

  it("can prefix the label for screen readers", () => {
    render(<StatusBadge kind="request" status="SENT" srPrefix="Request status" />);

    expect(screen.getByText("Request status:")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });
});
