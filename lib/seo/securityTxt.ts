/**
 * RFC 9116 security.txt body. No HTML, no UI.
 */
export function buildSecurityTxt(input: {
  contactEmail: string;
  canonicalUrl: string;
  expiresAt: Date;
  policyUrl?: string;
  preferredLanguages?: string;
}): string {
  const lines = [
    `Contact: mailto:${input.contactEmail}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    `Canonical: ${input.canonicalUrl}`,
    `Preferred-Languages: ${input.preferredLanguages ?? "en"}`,
  ];
  if (input.policyUrl) {
    lines.push(`Policy: ${input.policyUrl}`);
  }
  return `${lines.join("\n")}\n`;
}
