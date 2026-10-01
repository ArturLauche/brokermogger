import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { createLogger, safeMeta } from "@/lib/observability/logger";

const stage = z
  .string()
  .regex(/^[a-z0-9-]{1,30}$/)
  .parse(process.argv[2] ?? "final");
const directory = `.tmp/interface-${stage}`;
if (
  !["127.0.0.1", "localhost"].includes(new URL(env.APP_BASE_URL).hostname) ||
  new URL(env.DATABASE_URL).pathname !== "/brokermogger_test" ||
  !env.DATABASE_URL.includes("schema=bm_e2e_workflows") ||
  env.ALLOW_EXTERNAL_SENDING ||
  env.EMAIL_PROVIDER !== "mock"
)
  throw new Error(
    "Keyboard fixtures require the dedicated local browser schema and mock transport."
  );

async function main() {
  const manifest = z
    .array(z.object({ route: z.string().regex(/^\/(?!\/)/) }))
    .parse(JSON.parse(await readFile(`${directory}/findings.json`, "utf8")));
  const routes = [...new Set(manifest.map((row) => row.route))];
  type Check = {
    check: string;
    route?: string;
    mode?: string;
    viewport?: number;
    width?: number;
    h1?: number;
    passed: boolean;
  };
  const results: Check[] = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: env.APP_BASE_URL,
    storageState: ".tmp/interface-state.json",
    viewport: { width: 375, height: 1000 },
  });
  const page = await context.newPage();
  async function settled(route: string) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).origin).toBe(new URL(env.APP_BASE_URL).origin);
    await page.getByRole("main").waitFor();
    await page.waitForFunction(
      () =>
        document.readyState === "complete" &&
        ![...document.querySelectorAll('main [role="status"]')].some((node) =>
          node.textContent?.startsWith("Loading")
        )
    );
  }
  try {
    await settled("/vault");
    const controls: [string | RegExp, "dialog" | "menu"][] = [
      ["Open navigation", "dialog"],
      [/Account menu for/, "menu"],
      [/Change the active profile/, "menu"],
    ];
    for (const [name, role] of controls) {
      const trigger = page.getByRole("button", { name });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole(role)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      results.push({ check: String(name), passed: true });
    }
    const identifiers = page.getByRole("tab", { name: "Identifiers", exact: true });
    await identifiers.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Addresses", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "Export and deletion", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    const deleteTrigger = page.getByRole("button", {
      name: "Delete this profile",
      exact: true,
    });
    await deleteTrigger.focus();
    await page.keyboard.press("Enter");
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(deleteTrigger).toBeFocused();
    results.push({ check: "Destructive dialog cancellation", passed: true });
    await identifiers.click();
    const table = page.getByRole("region", { name: "Profile identifiers", exact: true });
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => table.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    results.push({ check: "Tabs and horizontal table", passed: true });
    for (const mode of [
      "720px viewport equivalence",
      "CSS magnification 200%",
    ] as const) {
      await page.setViewportSize(
        mode.startsWith("720px")
          ? { width: 720, height: 450 }
          : { width: 1440, height: 900 }
      );
      for (const route of routes) {
        await settled(route);
        if (mode.startsWith("CSS"))
          await page.evaluate(() => {
            document.documentElement.style.zoom = "2";
          });
        const geometry = await page.evaluate(() => ({
          viewport: innerWidth,
          width: document.documentElement.scrollWidth,
          h1: document.querySelectorAll("h1").length,
        }));
        results.push({
          check: "Readable layout and one main heading",
          route,
          mode,
          ...geometry,
          passed: geometry.width <= geometry.viewport + 1 && geometry.h1 === 1,
        });
        await writeFile(
          `${directory}/keyboard.json`,
          JSON.stringify(results, null, 2) + "\n"
        );
      }
    }
    expect(results.filter((result) => !result.passed)).toEqual([]);
    createLogger("interface-keyboard").info(
      safeMeta({ checks: results.length }, ["checks"]),
      "Keyboard and zoom checks passed"
    );
  } finally {
    await browser.close();
  }
}

void main().catch(async (error: unknown) => {
  await writeFile(
    `${directory}/keyboard-error.txt`,
    error instanceof Error
      ? (error.stack ?? error.message)
      : "Unknown verification failure"
  );
  createLogger("interface-keyboard").error(
    { err: error },
    "Keyboard verification failed; details are in the ignored local artifact."
  );
  process.exitCode = 1;
});
