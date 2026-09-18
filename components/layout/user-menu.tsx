"use client";

/**
 * Account menu in the application header.
 *
 * Auth.js performs sign-out through a server action, including session
 * revocation, cookie cleanup and its supported CSRF handling.
 */
import { LogOutIcon, SettingsIcon, ShieldIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/auth-actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { AppRole } from "./navigation";

export const ROLE_LABELS: Record<AppRole, string> = {
  USER: "User",
  MAINTAINER: "Maintainer",
  INSTANCE_ADMIN: "Instance admin",
};

export interface UserMenuProps {
  displayName: string;
  email: string;
  role: AppRole;
  className?: string;
}

export function UserMenu({ displayName, email, role, className }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("rounded-full", className)}
        >
          <UserIcon aria-hidden="true" />
          <span className="sr-only">Account menu for {displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1 text-foreground">
          <span className="font-medium">{displayName}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
          {role === "USER" ? null : (
            <span>
              <Badge variant="outline">{ROLE_LABELS[role]}</Badge>
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <SettingsIcon aria-hidden="true" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/privacy">
            <ShieldIcon aria-hidden="true" />
            Privacy settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
