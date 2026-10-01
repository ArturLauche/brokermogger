/** Safe navigation protocols. This does not authorize a server-side fetch. */
export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
