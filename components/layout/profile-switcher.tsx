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
import { useId, useState, useTransition } from "react";

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
  onProfileChange?: (id: string) => void | Promise<void>;
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const hintId = useId();

  function selectProfile(value: string) {
    if (value === activeProfileId || !onProfileChange) return;
    setError(false);
    startTransition(async () => {
      try {
        await onProfileChange(value);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="relative min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={pending || profiles.length === 0}
            aria-busy={pending || undefined}
            aria-describedby={
              pending || error || profiles.length === 0 ? hintId : undefined
            }
            className={cn(
              "h-11 max-w-56 min-w-0 justify-between gap-3 py-0.5 md:h-10",
              className
            )}
          >
            {active && isSelfProfile(active) ? (
              <UserIcon aria-hidden="true" />
            ) : (
              <UsersIcon aria-hidden="true" />
            )}
            <span
              aria-hidden="true"
              className="flex min-w-0 flex-1 flex-col items-start leading-tight"
            >
              <span className="max-w-full truncate">
                {pending
                  ? "Changing profile…"
                  : active
                    ? active.displayName
                    : "No profile selected"}
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
            <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuRadioGroup
            value={activeProfileId ?? ""}
            onValueChange={selectProfile}
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
      {error ? (
        <p
          id={hintId}
          role="alert"
          className="absolute top-full right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-sm"
        >
          The profile could not be changed. Your previous profile is still selected. Open
          the menu to try again.
        </p>
      ) : (
        <span id={hintId} role={pending ? "status" : undefined} className="sr-only">
          {pending
            ? "Changing the active profile"
            : profiles.length === 0
              ? "Set up a profile in onboarding to start."
              : ""}
        </span>
      )}
    </div>
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
