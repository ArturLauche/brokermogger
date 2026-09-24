/**
 * Navigation definition shared by every authenticated screen.
 *
 * `NavItem` is deliberately serialisable: the icon is a key into `NAV_ICONS`
 * instead of a component reference, so a server layout can hand the list to
 * the client side `AppShell` without crossing the "functions cannot be passed
 * to client components" boundary.
 *
 * Visibility here is a convenience for the interface only. The server still
 * has to check `can()` from `lib/permissions/policy.ts` on every request.
 */
import {
  Building2Icon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  InboxIcon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "USER" | "MAINTAINER" | "INSTANCE_ADMIN";

export const NAV_ICONS = {
  correspondence: InboxIcon,
  dashboard: LayoutDashboardIcon,
  onboarding: ListChecksIcon,
  vault: LockIcon,
  household: UsersIcon,
  brokers: Building2Icon,
  requests: SendIcon,
  evidence: PaperclipIcon,
  reports: FileTextIcon,
  account: SettingsIcon,
  privacy: ShieldIcon,
  admin: ServerIcon,
} as const satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export type NavGroup = "workspace" | "settings" | "administration";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  workspace: "Workspace",
  settings: "Settings",
  administration: "Administration",
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  group: NavGroup;
  /** Short explanation, used as the title attribute in collapsed layouts. */
  description?: string;
  /** Roles that see the entry. Undefined means every signed in role. */
  roles?: readonly AppRole[];
  /** Highlight only on an exact path match instead of a prefix match. */
  exact?: boolean;
}

export const PRIVILEGED_ROLES: readonly AppRole[] = ["MAINTAINER", "INSTANCE_ADMIN"];

export const APP_NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    group: "workspace",
    description: "Overview of your removal workflows.",
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    icon: "onboarding",
    group: "workspace",
    description: "Set up a profile step by step.",
  },
  {
    href: "/vault",
    label: "Data vault",
    icon: "vault",
    group: "workspace",
    description: "The identifiers stored for your profiles.",
  },
  {
    href: "/household",
    label: "Household",
    icon: "household",
    group: "workspace",
    description: "Profiles you manage for other adults.",
  },
  {
    href: "/brokers",
    label: "Brokers",
    icon: "brokers",
    group: "workspace",
    description: "The broker directory of this instance.",
  },
  {
    href: "/requests",
    label: "Requests",
    icon: "requests",
    group: "workspace",
    description: "Prepared, approved and sent privacy requests.",
  },
  {
    href: "/responses",
    label: "Correspondence",
    icon: "correspondence",
    group: "workspace",
    description: "Broker replies and unmatched messages awaiting your review.",
  },
  {
    href: "/evidence",
    label: "Evidence",
    icon: "evidence",
    group: "workspace",
    description: "Files and messages attached to your requests.",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    group: "workspace",
    description: "Exports of what you sent and what came back.",
  },
  {
    href: "/settings/account",
    label: "Account settings",
    icon: "account",
    group: "settings",
    description: "Sign in details, notifications and account deletion.",
  },
  {
    href: "/settings/privacy",
    label: "Privacy settings",
    icon: "privacy",
    group: "settings",
    description: "Retention, masking and what this instance stores.",
  },
  {
    href: "/admin",
    label: "Admin",
    icon: "admin",
    group: "administration",
    description: "Broker curation, legal rules, jobs and audit trail.",
    roles: PRIVILEGED_ROLES,
  },
];

export function visibleNavItems(
  items: readonly NavItem[],
  role: AppRole
): readonly NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

export function isNavItemActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface NavGroupWithItems {
  group: NavGroup;
  label: string;
  items: readonly NavItem[];
}

/** Groups items while keeping the order in which the groups first appear. */
export function groupNavItems(items: readonly NavItem[]): NavGroupWithItems[] {
  const groups: NavGroupWithItems[] = [];

  for (const item of items) {
    const existing = groups.find((entry) => entry.group === item.group);
    if (existing) {
      existing.items = [...existing.items, item];
      continue;
    }
    groups.push({
      group: item.group,
      label: NAV_GROUP_LABELS[item.group],
      items: [item],
    });
  }

  return groups;
}
