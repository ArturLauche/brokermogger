/**
 * Status vocabulary of the product.
 *
 * Status is never communicated by colour alone: every badge renders the human
 * readable label as text and every tone has its own icon shape. The label maps
 * are exported so that tables, filters, notifications and reports use exactly
 * the same wording as the badges.
 */
import type {
  BrokerVerificationStatus,
  ConsentStatus,
  RequestStatus,
} from "@prisma/client";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ClockIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Broker or request risk shown next to a broker entry. */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type StatusTone = "neutral" | "progress" | "success" | "warning" | "danger";

/** One distinct icon per tone, so the shape carries the meaning as well. */
export const STATUS_TONE_ICONS: Record<StatusTone, LucideIcon> = {
  neutral: CircleDashedIcon,
  progress: ClockIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleXIcon,
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-foreground/20 bg-foreground/5 text-foreground",
  progress: "border-info/30 bg-info/10 text-info",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  PREPARED: "Prepared",
  AWAITING_USER_APPROVAL: "Awaiting your approval",
  APPROVED: "Approved",
  SENT: "Sent",
  DELIVERED: "Delivered",
  WAITING_FOR_BROKER: "Waiting for broker",
  BROKER_REQUESTED_VERIFICATION: "Broker requested verification",
  NEEDS_USER_ACTION: "Needs your action",
  FOLLOW_UP_SCHEDULED: "Follow up scheduled",
  FOLLOW_UP_SENT: "Follow up sent",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partially completed",
  REJECTED: "Rejected",
  NO_RESPONSE: "No response",
  ESCALATION_RECOMMENDED: "Escalation recommended",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
  CLOSED: "Closed",
  FAILED: "Failed",
};

export const REQUEST_STATUS_TONES: Record<RequestStatus, StatusTone> = {
  DRAFT: "neutral",
  PREPARED: "progress",
  AWAITING_USER_APPROVAL: "warning",
  APPROVED: "progress",
  SENT: "progress",
  DELIVERED: "progress",
  WAITING_FOR_BROKER: "progress",
  BROKER_REQUESTED_VERIFICATION: "warning",
  NEEDS_USER_ACTION: "warning",
  FOLLOW_UP_SCHEDULED: "progress",
  FOLLOW_UP_SENT: "progress",
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  REJECTED: "danger",
  NO_RESPONSE: "warning",
  ESCALATION_RECOMMENDED: "warning",
  MANUAL_REVIEW_REQUIRED: "warning",
  CLOSED: "neutral",
  FAILED: "danger",
};

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  SELF: "Your own data",
  GUARDIAN_MANAGED: "Guardian managed",
  EXPLICIT_CONSENT_OBTAINED: "Consent given",
  PENDING_CONSENT: "Consent pending",
  NOT_ALLOWED: "Not allowed",
};

export const CONSENT_STATUS_TONES: Record<ConsentStatus, StatusTone> = {
  SELF: "success",
  GUARDIAN_MANAGED: "warning",
  EXPLICIT_CONSENT_OBTAINED: "success",
  PENDING_CONSENT: "warning",
  NOT_ALLOWED: "danger",
};

export const BROKER_VERIFICATION_STATUS_LABELS: Record<BrokerVerificationStatus, string> =
  {
    UNVERIFIED: "Unverified",
    SOURCE_FOUND: "Source found",
    CONTACT_VERIFIED: "Contact verified",
    REQUEST_METHOD_VERIFIED: "Request method verified",
    RESPONSE_BEHAVIOR_VERIFIED: "Response behaviour verified",
    DEPRECATED: "Deprecated",
    INACTIVE: "Inactive",
  };

export const BROKER_VERIFICATION_STATUS_TONES: Record<
  BrokerVerificationStatus,
  StatusTone
> = {
  UNVERIFIED: "neutral",
  SOURCE_FOUND: "progress",
  CONTACT_VERIFIED: "progress",
  REQUEST_METHOD_VERIFIED: "progress",
  RESPONSE_BEHAVIOR_VERIFIED: "success",
  DEPRECATED: "warning",
  INACTIVE: "neutral",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
  UNKNOWN: "Risk unknown",
};

export const RISK_LEVEL_TONES: Record<RiskLevel, StatusTone> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
  UNKNOWN: "neutral",
};

type StatusBadgeVariant =
  | { kind: "request"; status: RequestStatus }
  | { kind: "consent"; status: ConsentStatus }
  | { kind: "brokerVerification"; status: BrokerVerificationStatus }
  | { kind: "risk"; status: RiskLevel };

export type StatusBadgeProps = StatusBadgeVariant & {
  /** Prefix read before the label, for example "Request status". */
  srPrefix?: string;
  className?: string;
};

function resolve(variant: StatusBadgeVariant): { label: string; tone: StatusTone } {
  switch (variant.kind) {
    case "request":
      return {
        label: REQUEST_STATUS_LABELS[variant.status],
        tone: REQUEST_STATUS_TONES[variant.status],
      };
    case "consent":
      return {
        label: CONSENT_STATUS_LABELS[variant.status],
        tone: CONSENT_STATUS_TONES[variant.status],
      };
    case "brokerVerification":
      return {
        label: BROKER_VERIFICATION_STATUS_LABELS[variant.status],
        tone: BROKER_VERIFICATION_STATUS_TONES[variant.status],
      };
    case "risk":
      return {
        label: RISK_LEVEL_LABELS[variant.status],
        tone: RISK_LEVEL_TONES[variant.status],
      };
  }
}

export function StatusBadge({ srPrefix, className, ...variant }: StatusBadgeProps) {
  const { label, tone } = resolve(variant);
  const Icon = STATUS_TONE_ICONS[tone];

  return (
    <Badge
      variant="outline"
      data-status={variant.status}
      data-tone={tone}
      className={cn("h-6 gap-1.5 px-2", TONE_CLASSES[tone], className)}
    >
      <Icon aria-hidden="true" />
      {srPrefix ? <span className="sr-only">{srPrefix}: </span> : null}
      {label}
    </Badge>
  );
}
