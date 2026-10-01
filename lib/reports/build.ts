/**
 * User-facing privacy report payload. Pure: no I/O.
 */
export interface ReportRequestRow {
  id: string;
  brokerName: string;
  requestType: string;
  status: string;
  legalBasis: string | null;
  deadlineAt: string | null;
  deadlineOn?: string | null;
  deadlineIsEstimate?: boolean;
  deadlineBasis?: string | null;
  deadlineNote?: string | null;
  sentAt: string | null;
  /** Confirmed manual submission or a real provider acceptance; simulated sends are excluded. */
  contactedAt?: string | null;
}

export interface ReportPayload {
  title: string;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  profileLabel: string;
  timeZone: string;
  brokersContacted: string[];
  requests: ReportRequestRow[];
  openActions: string[];
  limitations: string[];
  nextSteps: string[];
  truncated: boolean;
}

export function buildReportPayload(input: {
  dateFrom: Date;
  dateTo: Date;
  profileLabel: string;
  requests: ReportRequestRow[];
  truncated?: boolean;
  requestCountCap?: number;
  timeZone?: string;
}): ReportPayload {
  const completed = input.requests.filter((row) => row.status === "COMPLETED").length;
  const truncated = input.truncated === true;
  const limitations = [
    "This report lists what this instance prepared, approved and sent. It is not a measurement of remaining copies of your data.",
    "Brokers can refuse, ignore or keep records they are legally allowed to keep.",
    "Brokermogger is not a law firm and does not guarantee removal.",
    "The range includes requests created on these calendar dates in the recorded account timezone. Statuses are read during generation and may change afterwards.",
    "Brokers contacted counts recorded manual submissions and real provider acceptance. Simulated sends and drafts are excluded; acceptance does not prove delivery.",
    `${completed} of ${input.requests.length} listed requests are marked completed.`,
  ];
  if (truncated) {
    limitations.push(
      `This report includes at most ${input.requestCountCap ?? input.requests.length} requests in the selected date range. Additional matching requests were omitted.`
    );
  }
  return {
    title: "Brokermogger privacy request report",
    generatedAt: new Date().toISOString(),
    dateFrom: input.dateFrom.toISOString().slice(0, 10),
    dateTo: input.dateTo.toISOString().slice(0, 10),
    profileLabel: input.profileLabel,
    timeZone: input.timeZone ?? "UTC",
    brokersContacted: [
      ...new Set(
        input.requests.filter((row) => row.contactedAt).map((row) => row.brokerName)
      ),
    ],
    requests: input.requests,
    openActions: input.requests
      .filter((row) =>
        [
          "AWAITING_USER_APPROVAL",
          "MANUAL_REVIEW_REQUIRED",
          "NEEDS_USER_ACTION",
          "BROKER_REQUESTED_VERIFICATION",
        ].includes(row.status)
      )
      .map(
        (row) => `${row.brokerName}: ${row.status.replaceAll("_", " ").toLowerCase()}`
      ),
    limitations,
    nextSteps: [
      "Review requests that still need your approval or a manual channel.",
      "Keep evidence files only as long as you need them.",
      "Do not send identity documents unless a specific request asked for them.",
    ],
    truncated,
  };
}

export function reportToJson(payload: ReportPayload): Buffer {
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
