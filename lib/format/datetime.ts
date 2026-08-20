export function formatUtcStamp(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatIsoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "—";
}
