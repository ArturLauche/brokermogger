"use client";

/**
 * Switches between the account holder profile and managed household profiles.
 *
 * Working on behalf of somebody else is a consequential state, so the current
 * profile is always spelled out: the trigger names the profile and says
 * whether it is your own data or a managed profile, and every entry carries
 * its consent status. Nothing here relies on colour.
 */
import type { ConsentStatus, ProfileKind } from "@prisma/client";
import { ChevronsUpDownIcon, UserIcon, UsersIcon } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ProfileSummary {
  id: string;
  displayName: string;
  kind: ProfileKind;
  consentStatus: ConsentStatus;
}

export interface ProfileSwitcherProps {
  profiles: readonly ProfileSummary[];
  activeProfileId: string | null;
  onProfileChange?: (id: string) => void;
  className?: string;
}

function isSelfProfile(profile: ProfileSummary): boolean {
  return profile.kind === "SELF";
}

function ownershipLabel(profile: ProfileSummary): string {
  return isSelfProfile(profile) ? "Self" : "Managed";
}

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onProfileChange,
  className,
}: ProfileSwitcherProps) {
  const active = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const selfProfiles = profiles.filter(isSelfProfile);
  const managedProfiles = profiles.filter((profile) => !isSelfProfile(profile));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-auto max-w-56 justify-between gap-2 py-1", className)}
        >
          {active && isSelfProfile(active) ? (
            <UserIcon aria-hidden="true" />
          ) : (
            <UsersIcon aria-hidden="true" />
          )}
          <span
            aria-hidden="true"
            className="flex min-w-0 flex-col items-start leading-tight"
          >
            <span className="truncate">
              {active ? active.displayName : "No profile selected"}
            </span>
            {active ? (
              <span className="text-xs text-muted-foreground">
                {ownershipLabel(active)}
              </span>
            ) : null}
          </span>
          <span className="sr-only">
            {active
              ? `Active profile: ${active.displayName}, ${ownershipLabel(active)}. Change the active profile`
              : "No profile selected. Change the active profile"}
          </span>
          <ChevronsUpDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuRadioGroup
          value={activeProfileId ?? ""}
          onValueChange={(value) => onProfileChange?.(value)}
        >
          {selfProfiles.length > 0 ? (
            <>
              <DropdownMenuLabel>Your own profile</DropdownMenuLabel>
              {selfProfiles.map((profile) => (
                <ProfileEntry key={profile.id} profile={profile} />
              ))}
            </>
          ) : null}
          {managedProfiles.length > 0 ? (
            <>
              {selfProfiles.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>Managed household profiles</DropdownMenuLabel>
              {managedProfiles.map((profile) => (
                <ProfileEntry key={profile.id} profile={profile} />
              ))}
            </>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileEntry({ profile }: { profile: ProfileSummary }) {
  return (
    <DropdownMenuRadioItem value={profile.id} className="items-start gap-2 py-2">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{profile.displayName}</span>
          <Badge variant="outline">{ownershipLabel(profile)}</Badge>
        </span>
        <StatusBadge
          kind="consent"
          status={profile.consentStatus}
          srPrefix="Consent status"
        />
      </span>
    </DropdownMenuRadioItem>
  );
}
