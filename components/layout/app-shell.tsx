"use client";

/**
 * Frame of every authenticated screen: skip link, sidebar navigation, header
 * with the profile switcher and the account menu, and the main region.
 *
 * This component is purely presentational. It receives the signed in user, the
 * profiles and the navigation as props and never reads the session itself, so
 * the authenticated layout can decide how the data is loaded and how a profile
 * change is persisted.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  NAV_ICONS,
  groupNavItems,
  isNavItemActive,
  visibleNavItems,
  type AppRole,
  type NavItem,
} from "./navigation";
import { ProfileSwitcher, type ProfileSummary } from "./profile-switcher";
import { UserMenu } from "./user-menu";
import { LinkPending } from "@/components/common/link-pending";

export interface AppShellUser {
  displayName: string;
  email: string;
  role: AppRole;
}

export interface AppShellProps {
  user: AppShellUser;
  profiles: ProfileSummary[];
  activeProfileId: string | null;
  navItems: readonly NavItem[];
  children: React.ReactNode;
  onProfileChange?: (id: string) => void | Promise<void>;
}

export function AppShell({
  user,
  profiles,
  activeProfileId,
  navItems,
  children,
  onProfileChange,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const items = visibleNavItems(navItems, user.role);
  const groups = groupNavItems(items);

  const navigation = (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isNavItemActive(item, pathname);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors md:min-h-10",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {item.label}
                    <LinkPending />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2 md:flex md:h-16 md:px-6 md:py-0">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="md:hidden">
              <MenuIcon aria-hidden="true" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Sections of this instance.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Main" className="overflow-y-auto px-3 pb-6">
              {navigation}
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/dashboard" className="min-w-0 truncate font-heading font-semibold">
          Brokermogger
        </Link>

        <div className="col-span-3 col-start-1 row-start-2 min-w-0 border-t pt-2 md:ml-auto md:border-0 md:pt-0">
          <ProfileSwitcher
            className="w-full max-w-none md:w-auto md:max-w-64"
            profiles={profiles}
            activeProfileId={activeProfileId}
            {...(onProfileChange ? { onProfileChange } : {})}
          />
        </div>
        <div className="col-start-3 row-start-1 justify-self-end">
          <UserMenu displayName={user.displayName} email={user.email} role={user.role} />
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
          <nav
            aria-label="Main"
            className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto p-3"
          >
            {navigation}
          </nav>
        </aside>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 focus:outline-none md:px-6 md:py-8"
        >
          <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
