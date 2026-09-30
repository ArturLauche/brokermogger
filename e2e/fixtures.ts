import { expect, test as base } from "@playwright/test";

/** Every browser journey runs against the same strict production policy. */
export const test = base.extend<{ browserProblems: void }>({
  browserProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      await page.exposeFunction(
        "recordBrowserPolicyViolation",
        (directive: string, resource: string, route: string) => {
          problems.push(
            `Content Security Policy: ${directive} (${resource}) on ${route}`
          );
        }
      );
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          void (
            window as Window & {
              recordBrowserPolicyViolation?: (
                directive: string,
                resource: string,
                route: string
              ) => Promise<void>;
            }
          ).recordBrowserPolicyViolation?.(
            event.effectiveDirective,
            event.blockedURI === "eval" || event.blockedURI === "inline"
              ? event.blockedURI
              : "resource",
            location.pathname
          );
        });
      });
      page.on("pageerror", (error) => problems.push(error.message));
      page.on("console", (message) => {
        if (!["error", "warning"].includes(message.type())) return;
        // A deliberately missing route still has a real HTTP 404 status.
        if (/Failed to load resource:.*404/.test(message.text())) return;
        problems.push(message.text());
      });
      await use();
      expect(problems, "Browser, hydration and CSP errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
