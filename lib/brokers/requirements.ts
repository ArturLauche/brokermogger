/** Public catalogue instructions; unknown legacy properties are not rendered as HTML. */
export function brokerRequirements(raw: unknown) {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    identityDocument: value.identityDocument === true,
    accountRequired: value.accountRequired === true,
    notarised: value.notarised === true,
    notes: typeof value.notes === "string" ? value.notes.slice(0, 4000) : "",
  };
}
