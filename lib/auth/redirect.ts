/** Only this instance's configured origin may receive authentication redirects. */
export function authRedirect(url: string, applicationUrl: string): string {
  const application = new URL(applicationUrl);
  const fallback = new URL("/dashboard", application).href;
  try {
    const target = new URL(url, application);
    return target.origin === application.origin ? target.href : fallback;
  } catch {
    return fallback;
  }
}
