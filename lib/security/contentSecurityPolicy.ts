/** Per-response policy. Script protection stays strict in every production build. */
export function buildContentSecurityPolicy(
  nonce: string,
  options: { development: boolean; https: boolean }
): string {
  const scriptSrc = options.development
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSrc = options.development
    ? `'self' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}'`;
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    // Radix positions menus and tracks tab dimensions with style attributes.
    // This does not authorize inline scripts or unnonced style elements.
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${options.development ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    ...(options.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
