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
  sentAt: string | null;
}

export interface ReportPayload {
  title: string;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  profileLabel: string;
  brokersContacted: string[];
  requests: ReportRequestRow[];
  openActions: string[];
  limitations: string[];
  nextSteps: string[];
}

export function buildReportPayload(input: {
  dateFrom: Date;
  dateTo: Date;
  profileLabel: string;
  requests: ReportRequestRow[];
}): ReportPayload {
  const completed = input.requests.filter((row) => row.status === "COMPLETED").length;
  return {
    title: "Brokermogger privacy request report",
    generatedAt: new Date().toISOString(),
    dateFrom: input.dateFrom.toISOString().slice(0, 10),
    dateTo: input.dateTo.toISOString().slice(0, 10),
    profileLabel: input.profileLabel,
    brokersContacted: [...new Set(input.requests.map((row) => row.brokerName))],
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
    limitations: [
      "This report lists what this instance prepared, approved and sent. It is not a measurement of remaining copies of your data.",
      "Brokers can refuse, ignore or keep records they are legally allowed to keep.",
      "Brokermogger is not a law firm and does not guarantee removal.",
      `${completed} of ${input.requests.length} listed requests are marked completed.`,
    ],
    nextSteps: [
      "Review requests that still need your approval or a manual channel.",
      "Keep evidence files only as long as you need them.",
      "Do not send identity documents unless a specific request asked for them.",
    ],
  };
}

export function reportToJson(payload: ReportPayload): Buffer {
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
