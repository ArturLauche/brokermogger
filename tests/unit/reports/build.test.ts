import { describe, expect, it } from "vitest";

import { buildReportPayload, reportToJson } from "@/lib/reports/build";

describe("report payload", () => {
  it("names limitations and does not claim remaining copies were measured", () => {
    const payload = buildReportPayload({
      dateFrom: new Date("2026-01-01"),
      dateTo: new Date("2026-06-01"),
      profileLabel: "Ada",
      requests: [
        {
          id: "1",
          brokerName: "Example Broker",
          requestType: "DELETION",
          status: "COMPLETED",
          legalBasis: "Art. 17 GDPR",
          deadlineAt: "2026-02-01",
          sentAt: "2026-01-02",
          contactedAt: "2026-01-02",
        },
        {
          id: "2",
          brokerName: "Example Broker",
          requestType: "DELETION",
          status: "AWAITING_USER_APPROVAL",
          legalBasis: "Art. 17 GDPR",
          deadlineAt: null,
          sentAt: null,
        },
      ],
    });

    expect(payload.brokersContacted).toEqual(["Example Broker"]);
    expect(payload.openActions[0]).toMatch(/awaiting user approval/i);
    expect(payload.limitations.join(" ")).toMatch(/not a measurement/i);
    expect(payload.limitations.join(" ")).toMatch(/not a law firm/i);
    expect(payload.truncated).toBe(false);
    expect(JSON.parse(reportToJson(payload).toString("utf8")).title).toContain(
      "Brokermogger"
    );
  });

  it("records a visible truncation note when the result set was capped", () => {
    const payload = buildReportPayload({
      dateFrom: new Date("2026-01-01"),
      dateTo: new Date("2026-06-01"),
      profileLabel: "Ada",
      truncated: true,
      requestCountCap: 10_000,
      requests: [
        {
          id: "1",
          brokerName: "Example Broker",
          requestType: "DELETION",
          status: "COMPLETED",
          legalBasis: "Art. 17 GDPR",
          deadlineAt: "2026-02-01",
          sentAt: "2026-01-02",
        },
      ],
    });

    expect(payload.truncated).toBe(true);
    expect(payload.limitations.join(" ")).toMatch(/at most 10000 requests/i);
  });
});
