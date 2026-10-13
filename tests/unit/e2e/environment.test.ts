import { afterEach, expect, it, vi } from "vitest";
import { assertIsolatedBrowserEnvironment } from "../../../e2e/helpers";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "", "malformed", "postgresql://private:secret@"])(
  "explains missing or malformed browser database configuration without exposing it: %#",
  (value) => {
    vi.stubEnv("DATABASE_URL", value);
    expect(() => assertIsolatedBrowserEnvironment()).toThrow(
      "Browser fixtures require a local server, a dedicated test database and disabled external sending."
    );
  }
);

it("rejects malformed browser origins with the same isolated-environment message", () => {
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic@localhost/brokermogger_test");
  vi.stubEnv("E2E_BASE_URL", "malformed");
  expect(() => assertIsolatedBrowserEnvironment()).toThrow(/Browser fixtures require/);
});
