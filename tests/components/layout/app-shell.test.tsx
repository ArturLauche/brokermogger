import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { APP_NAV_ITEMS, type AppRole } from "@/components/layout/navigation";
import type { ProfileSummary } from "@/components/layout/profile-switcher";

vi.mock("next/navigation", () => ({
  usePathname: () => "/requests/abc",
}));

const PROFILES: ProfileSummary[] = [
  { id: "p1", displayName: "Alex Fischer", kind: "SELF", consentStatus: "SELF" },
  {
    id: "p2",
    displayName: "Mira Fischer",
    kind: "HOUSEHOLD_ADULT",
    consentStatus: "PENDING_CONSENT",
  },
];

function renderShell(role: AppRole) {
  return render(
    <AppShell
      user={{ displayName: "Alex Fischer", email: "alex@example.com", role }}
      profiles={PROFILES}
      activeProfileId="p1"
      navItems={APP_NAV_ITEMS}
    >
      <h1>Requests</h1>
    </AppShell>
  );
}

describe("AppShell", () => {
  it("renders the skip link, the navigation landmark and the main region", () => {
    renderShell("USER");

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent("Requests");
  });

  it("links to every workspace and settings target", () => {
    renderShell("USER");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual([
      "/dashboard",
      "/onboarding",
      "/vault",
      "/household",
      "/brokers",
      "/requests",
      "/evidence",
      "/reports",
      "/settings/account",
      "/settings/privacy",
    ]);
  });

  it("marks the active section with aria-current", () => {
    renderShell("USER");
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("link", { name: "Requests" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("hides the admin entry from regular users", () => {
    renderShell("USER");

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  });

  it.each(["MAINTAINER", "INSTANCE_ADMIN"] as const)(
    "shows the admin entry for %s",
    (role) => {
      renderShell(role);

      expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
        "href",
        "/admin"
      );
    }
  );

  it("names the active profile in the switcher trigger", () => {
    renderShell("USER");

    expect(
      screen.getByRole("button", {
        name: "Active profile: Alex Fischer, Self. Change the active profile",
      })
    ).toBeInTheDocument();
  });

  it("opens the account menu with the sign out form", async () => {
    const user = userEvent.setup();
    renderShell("USER");

    await user.click(
      screen.getByRole("button", { name: "Account menu for Alex Fischer" })
    );

    expect(
      await screen.findByRole("menuitem", { name: /Account settings/ })
    ).toHaveAttribute("href", "/settings/account");
    expect(screen.getByRole("menuitem", { name: /Privacy settings/ })).toHaveAttribute(
      "href",
      "/settings/privacy"
    );

    const signOut = screen.getByRole("menuitem", { name: /Sign out/ });
    expect(signOut.closest("form")).toHaveAttribute("action", "/api/auth/signout");
    expect(signOut.closest("form")).toHaveAttribute("method", "post");
  });
});
