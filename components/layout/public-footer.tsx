/**
 * Footer of the public pages.
 *
 * Says what the project is, under which licence it ships, where to report a
 * security problem and, plainly, that none of this is legal advice. The links
 * are props because a self hosted instance decides where its source and its
 * documentation live. Defaults point at the public Brokermogger repository
 * until the operator overrides them.
 */
import Link from "next/link";

import {
  DEFAULT_DOCUMENTATION_URL,
  DEFAULT_REPOSITORY_URL,
  DEFAULT_SECURITY_ADVISORIES_URL,
  DEFAULT_SECURITY_CONTACT,
  isPlaceholderSecurityContact,
  LICENSE_NAME,
  SITE_NAME,
} from "@/lib/config/site";
import { ExternalLink } from "@/components/common/external-link";
import { cn } from "@/lib/utils";

export const PLACEHOLDER_REPOSITORY_URL = DEFAULT_REPOSITORY_URL;
export const PLACEHOLDER_DOCUMENTATION_URL = DEFAULT_DOCUMENTATION_URL;
export const PLACEHOLDER_SECURITY_CONTACT = DEFAULT_SECURITY_CONTACT;

export interface PublicFooterProps {
  instanceName?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  securityContactEmail?: string;
  licenseName?: string;
  className?: string;
}

export function PublicFooter({
  instanceName = SITE_NAME,
  repositoryUrl = DEFAULT_REPOSITORY_URL,
  documentationUrl = DEFAULT_DOCUMENTATION_URL,
  securityContactEmail = DEFAULT_SECURITY_CONTACT,
  licenseName = LICENSE_NAME,
  className,
}: PublicFooterProps) {
  const securityIsPlaceholder = isPlaceholderSecurityContact(securityContactEmail);
  return (
    <footer className={cn("border-t bg-muted/40", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <p className="font-heading font-semibold">{instanceName}</p>
            <p className="text-sm text-muted-foreground">
              Free and open source software for preparing, approving and tracking your own
              privacy requests. You can run your own instance.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Project</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>
                <ExternalLink href={documentationUrl}>Documentation</ExternalLink>
              </li>
              <li>
                <ExternalLink href={repositoryUrl}>Source code</ExternalLink>
              </li>
              <li>
                Licence: <span className="font-medium">{licenseName}</span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              The operator of this instance configures the repository and documentation
              links.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Security</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>
                Report a vulnerability:{" "}
                {securityIsPlaceholder ? (
                  <ExternalLink href={DEFAULT_SECURITY_ADVISORIES_URL}>
                    GitHub security advisories
                  </ExternalLink>
                ) : (
                  <a
                    href={`mailto:${securityContactEmail}`}
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    {securityContactEmail}
                  </a>
                )}
              </li>
              <li>
                <Link
                  href="/#security"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Security principles
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Account</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/login"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Create an account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="border-t pt-6 text-sm text-muted-foreground">
          {instanceName} is not a law firm and does not give legal advice. The information
          in this interface describes what the software does, not what the law requires in
          your situation.
        </p>
      </div>
    </footer>
  );
}
