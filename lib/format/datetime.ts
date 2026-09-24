export function formatUtcStamp(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatIsoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "—";
}

/** A calendar date in an account's validated IANA timezone, without UTC day shifts. */
export function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Create once per screen/request; date-only legal and report boundaries use formatIsoDate. */
export function createDateFormatter(timeZone: string) {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone }).format();
  } catch {
    zone = "UTC";
  }
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return {
    timeZone: zone,
    formatStamp: (value: Date) => stamp.format(value),
    formatDate: (value: Date | null | undefined) => (value ? date.format(value) : "—"),
  };
}
