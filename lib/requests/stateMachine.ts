/**
 * The single source of truth for removal request status transitions.
 *
 * Every status change in the product goes through `assertTransition` and
 * produces a RemovalRequestEvent. Arbitrary status writes are not possible:
 * `applyRequestStatus` in the request repository is the only writer. It
 * updates the row and appends the hash-chained event in one transaction.
 */
import { type RequestStatus } from "@prisma/client";

import { InvalidStateTransitionError } from "@/lib/core/errors";

export type TransitionActor = "USER" | "SYSTEM" | "ADMIN" | "BROKER";

export interface TransitionRule {
  to: RequestStatus;
  /** Who may trigger this transition. */
  actors: readonly TransitionActor[];
  /** Short machine readable reason, mirrored into the event payload. */
  description: string;
}

/**
 * Allowed transitions. Anything not listed here is rejected.
 *
 * Terminal states: CLOSED. FAILED and REJECTED can still be closed or retried
 * through an explicit user action.
 */
const BASE_TRANSITIONS: Readonly<Record<RequestStatus, readonly TransitionRule[]>> = {
  DRAFT: [
    { to: "PREPARED", actors: ["USER", "SYSTEM"], description: "Draft rendered" },
    {
      to: "MANUAL_REVIEW_REQUIRED",
      actors: ["USER", "SYSTEM"],
      description: "Safety check triggered",
    },
    { to: "CLOSED", actors: ["USER"], description: "Discarded by user" },
  ],
  PREPARED: [
    {
      to: "AWAITING_USER_APPROVAL",
      actors: ["USER", "SYSTEM"],
      description: "Sent to approval",
    },
    {
      to: "MANUAL_REVIEW_REQUIRED",
      actors: ["USER", "SYSTEM"],
      description: "Safety check triggered",
    },
    { to: "DRAFT", actors: ["USER"], description: "Reopened for editing" },
    { to: "CLOSED", actors: ["USER"], description: "Discarded by user" },
  ],
  AWAITING_USER_APPROVAL: [
    { to: "APPROVED", actors: ["USER"], description: "Approved by the account holder" },
    { to: "DRAFT", actors: ["USER"], description: "Reopened for editing" },
    {
      to: "MANUAL_REVIEW_REQUIRED",
      actors: ["USER", "SYSTEM", "ADMIN"],
      description: "Escalated to review",
    },
    { to: "CLOSED", actors: ["USER"], description: "Discarded by user" },
  ],
  MANUAL_REVIEW_REQUIRED: [
    {
      to: "AWAITING_USER_APPROVAL",
      actors: ["USER", "ADMIN"],
      description: "Review resolved",
    },
    { to: "DRAFT", actors: ["USER", "ADMIN"], description: "Sent back for editing" },
    {
      to: "CLOSED",
      actors: ["USER", "ADMIN"],
      description: "Review rejected the request",
    },
  ],
  APPROVED: [
    {
      to: "DRAFT",
      actors: ["USER"],
      description: "Approval withdrawn before dispatch for editing",
    },
    { to: "SENT", actors: ["SYSTEM"], description: "Dispatched to the broker" },
    {
      to: "NEEDS_USER_ACTION",
      actors: ["SYSTEM"],
      description: "Manual channel requires the user",
    },
    { to: "FAILED", actors: ["SYSTEM"], description: "Dispatch failed permanently" },
    { to: "CLOSED", actors: ["USER"], description: "Withdrawn before sending" },
  ],
  SENT: [
    { to: "DELIVERED", actors: ["SYSTEM"], description: "Delivery confirmed" },
    {
      to: "WAITING_FOR_BROKER",
      actors: ["SYSTEM"],
      description: "Awaiting broker reply",
    },
    {
      to: "FAILED",
      actors: ["SYSTEM"],
      description: "Bounced or rejected by the mail system",
    },
    {
      to: "NEEDS_USER_ACTION",
      actors: ["SYSTEM", "USER"],
      description: "User input required",
    },
  ],
  DELIVERED: [
    {
      to: "WAITING_FOR_BROKER",
      actors: ["SYSTEM"],
      description: "Awaiting broker reply",
    },
    {
      to: "BROKER_REQUESTED_VERIFICATION",
      actors: ["SYSTEM", "BROKER"],
      description: "Broker asked for verification",
    },
    {
      to: "COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker confirmed completion",
    },
    {
      to: "PARTIALLY_COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker completed part of the request",
    },
    {
      to: "REJECTED",
      actors: ["SYSTEM", "USER"],
      description: "Broker rejected the request",
    },
  ],
  WAITING_FOR_BROKER: [
    {
      to: "BROKER_REQUESTED_VERIFICATION",
      actors: ["SYSTEM", "BROKER"],
      description: "Broker asked for verification",
    },
    {
      to: "COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker confirmed completion",
    },
    {
      to: "PARTIALLY_COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker completed part of the request",
    },
    {
      to: "REJECTED",
      actors: ["SYSTEM", "USER"],
      description: "Broker rejected the request",
    },
    {
      to: "NO_RESPONSE",
      actors: ["SYSTEM"],
      description: "Deadline passed without a reply",
    },
    {
      to: "NEEDS_USER_ACTION",
      actors: ["SYSTEM", "USER"],
      description: "User input required",
    },
    {
      to: "FOLLOW_UP_SCHEDULED",
      actors: ["SYSTEM", "USER"],
      description: "Follow up prepared",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  BROKER_REQUESTED_VERIFICATION: [
    {
      to: "NEEDS_USER_ACTION",
      actors: ["SYSTEM"],
      description: "Verification requires the user",
    },
    {
      to: "WAITING_FOR_BROKER",
      actors: ["SYSTEM", "USER"],
      description: "Verification supplied",
    },
    {
      to: "REJECTED",
      actors: ["SYSTEM", "USER"],
      description: "Verification refused or impossible",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  NEEDS_USER_ACTION: [
    {
      to: "DRAFT",
      actors: ["USER"],
      description: "Manual submission draft reopened before submission",
    },
    {
      to: "WAITING_FOR_BROKER",
      actors: ["USER", "SYSTEM"],
      description: "User completed the action",
    },
    { to: "AWAITING_USER_APPROVAL", actors: ["USER"], description: "New draft prepared" },
    { to: "COMPLETED", actors: ["USER"], description: "User confirmed completion" },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
    { to: "FAILED", actors: ["SYSTEM"], description: "Action window expired" },
  ],
  FOLLOW_UP_SCHEDULED: [
    {
      to: "AWAITING_USER_APPROVAL",
      actors: ["SYSTEM", "USER"],
      description: "Follow up awaits approval",
    },
    { to: "FOLLOW_UP_SENT", actors: ["SYSTEM"], description: "Follow up dispatched" },
    {
      to: "WAITING_FOR_BROKER",
      actors: ["SYSTEM", "USER"],
      description: "Follow up cancelled",
    },
    {
      to: "ESCALATION_RECOMMENDED",
      actors: ["SYSTEM"],
      description: "Follow-up cap reached before approval",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  FOLLOW_UP_SENT: [
    {
      to: "WAITING_FOR_BROKER",
      actors: ["SYSTEM"],
      description: "Awaiting broker reply",
    },
    {
      to: "COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker confirmed completion",
    },
    {
      to: "PARTIALLY_COMPLETED",
      actors: ["SYSTEM", "USER"],
      description: "Broker completed part of the request",
    },
    {
      to: "REJECTED",
      actors: ["SYSTEM", "USER"],
      description: "Broker rejected the request",
    },
    {
      to: "NO_RESPONSE",
      actors: ["SYSTEM"],
      description: "Still no reply after the follow up",
    },
    {
      to: "ESCALATION_RECOMMENDED",
      actors: ["SYSTEM"],
      description: "Escalation suggested to the user",
    },
  ],
  NO_RESPONSE: [
    {
      to: "FOLLOW_UP_SCHEDULED",
      actors: ["SYSTEM", "USER"],
      description: "Follow up prepared",
    },
    {
      to: "ESCALATION_RECOMMENDED",
      actors: ["SYSTEM", "USER"],
      description: "Escalation suggested to the user",
    },
    {
      to: "COMPLETED",
      actors: ["USER"],
      description: "User confirmed completion out of band",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  ESCALATION_RECOMMENDED: [
    {
      to: "AWAITING_USER_APPROVAL",
      actors: ["USER"],
      description: "Escalation draft prepared",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
    { to: "COMPLETED", actors: ["USER"], description: "Resolved before escalation" },
  ],
  COMPLETED: [{ to: "CLOSED", actors: ["USER", "SYSTEM"], description: "Archived" }],
  PARTIALLY_COMPLETED: [
    {
      to: "FOLLOW_UP_SCHEDULED",
      actors: ["USER", "SYSTEM"],
      description: "Follow up for the remainder",
    },
    { to: "COMPLETED", actors: ["USER"], description: "User confirmed full completion" },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  REJECTED: [
    {
      to: "ESCALATION_RECOMMENDED",
      actors: ["USER", "SYSTEM"],
      description: "Escalation suggested",
    },
    {
      to: "NEEDS_USER_ACTION",
      actors: ["USER", "SYSTEM"],
      description: "Rejection needs a user decision",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  FAILED: [
    { to: "DRAFT", actors: ["USER"], description: "New draft after a confirmed failure" },
    {
      to: "AWAITING_USER_APPROVAL",
      actors: ["USER"],
      description: "Re-approved after a failure",
    },
    { to: "CLOSED", actors: ["USER"], description: "Closed by user" },
  ],
  CLOSED: [],
};

// A reply to an earlier submitted message can arrive while its follow-up is
// drafted or queued. The response repository additionally requires submission
// history, explicit owner confirmation and the status the owner actually saw.
const RESPONSE_STATES: readonly RequestStatus[] = [
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "BROKER_REQUESTED_VERIFICATION",
  "NEEDS_USER_ACTION",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_SENT",
  "NO_RESPONSE",
  "ESCALATION_RECOMMENDED",
  "PARTIALLY_COMPLETED",
  "REJECTED",
  "COMPLETED",
  "AWAITING_USER_APPROVAL",
  "MANUAL_REVIEW_REQUIRED",
  "APPROVED",
];
const RESPONSE_OUTCOMES: readonly RequestStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "REJECTED",
  "BROKER_REQUESTED_VERIFICATION",
];
function withConfirmedResponseTransitions() {
  const transitions = { ...BASE_TRANSITIONS };
  for (const from of RESPONSE_STATES) {
    const rules = [...transitions[from]];
    for (const to of RESPONSE_OUTCOMES) {
      if (to === from) continue;
      const previous = rules.findIndex((rule) => rule.to === to);
      if (previous === -1)
        rules.push({
          to,
          actors: ["USER"],
          description: "Broker outcome confirmed by the account holder",
        });
      else if (!rules[previous]!.actors.includes("USER"))
        rules[previous] = {
          ...rules[previous]!,
          actors: [...rules[previous]!.actors, "USER"],
        };
    }
    transitions[from] = rules;
  }
  return transitions;
}
export const TRANSITIONS = withConfirmedResponseTransitions();

export const TERMINAL_STATUSES: readonly RequestStatus[] = ["CLOSED"];

/** Statuses that count as "in flight" for duplicate detection and quotas. */
export const OPEN_STATUSES: readonly RequestStatus[] = [
  "DRAFT",
  "PREPARED",
  "AWAITING_USER_APPROVAL",
  "MANUAL_REVIEW_REQUIRED",
  "APPROVED",
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "BROKER_REQUESTED_VERIFICATION",
  "NEEDS_USER_ACTION",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_SENT",
  "NO_RESPONSE",
  "ESCALATION_RECOMMENDED",
  "PARTIALLY_COMPLETED",
];

/** Statuses where the user has something to do. Drives the dashboard counter. */
export const NEEDS_USER_ACTION_STATUSES: readonly RequestStatus[] = [
  "AWAITING_USER_APPROVAL",
  "MANUAL_REVIEW_REQUIRED",
  "BROKER_REQUESTED_VERIFICATION",
  "NEEDS_USER_ACTION",
  "ESCALATION_RECOMMENDED",
];

/** Statuses where the request is waiting on the broker. */
export const WAITING_STATUSES: readonly RequestStatus[] = [
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "FOLLOW_UP_SENT",
];

export function allowedTransitions(from: RequestStatus): readonly TransitionRule[] {
  return TRANSITIONS[from];
}

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  actor: TransitionActor
): boolean {
  return TRANSITIONS[from].some((rule) => rule.to === to && rule.actors.includes(actor));
}

export function assertTransition(
  from: RequestStatus,
  to: RequestStatus,
  actor: TransitionActor
): TransitionRule {
  const rule = TRANSITIONS[from].find((candidate) => candidate.to === to);

  if (!rule) {
    throw new InvalidStateTransitionError(from, to, "transition_not_allowed");
  }

  if (!rule.actors.includes(actor)) {
    throw new InvalidStateTransitionError(
      from,
      to,
      `actor_${actor.toLowerCase()}_not_allowed`
    );
  }

  return rule;
}

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isOpen(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}
