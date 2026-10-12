import { expect, it, vi } from "vitest";
import {
  oncePerMagicLinkRequest,
  withMagicLinkContext,
} from "@/lib/auth/magicLinkContext";
const context = {
  requestId: "synthetic-request",
  ipHash: null,
  userAgentHash: null,
  entryPoint: "login_form" as const,
};

it("memoises concurrent pre-issuance/delivery checks once per address and request", async () => {
  const check = vi.fn(async () => true);
  await withMagicLinkContext(context, async () => {
    expect(
      await Promise.all(
        Array.from({ length: 8 }, () =>
          oncePerMagicLinkRequest("synthetic@example.org", check)
        )
      )
    ).toEqual(Array(8).fill(true));
    await oncePerMagicLinkRequest("other@example.org", check);
  });
  expect(check).toHaveBeenCalledTimes(2);
  await withMagicLinkContext(context, () =>
    oncePerMagicLinkRequest("synthetic@example.org", check)
  );
  expect(check).toHaveBeenCalledTimes(3);
});

it("retains a failed gate so a later delivery check cannot bypass it", async () => {
  const failure = new Error("synthetic database failure");
  const check = vi.fn(async () => {
    throw failure;
  });
  await withMagicLinkContext(context, async () => {
    await expect(oncePerMagicLinkRequest("synthetic@example.org", check)).rejects.toThrow(
      failure
    );
    await expect(oncePerMagicLinkRequest("synthetic@example.org", check)).rejects.toThrow(
      failure
    );
  });
  expect(check).toHaveBeenCalledTimes(1);
});
