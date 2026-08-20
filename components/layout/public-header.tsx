/**
 * Header of the public pages.
 *
 * Pure markup with no client state so that the landing page keeps working
 * without JavaScript. Section links are absolute (`/#how-it-works`) so the
 * same header can sit on the 404 and error pages.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PublicNavLink {
  href: string;
  label: string;
}

export const LANDING_SECTION_LINKS: readonly PublicNavLink[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Where it works" },
  { href: "/#limitations", label: "Limitations" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "Questions" },
];

export interface PublicHeaderProps {
  links?: readonly PublicNavLink[];
  className?: string;
}

export function PublicHeader({
  links = LANDING_SECTION_LINKS,
  className,
}: PublicHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-background supports-backdrop-filter:bg-background/90 supports-backdrop-filter:backdrop-blur",
        className
      )}
    >
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="font-heading text-base font-semibold">
          Brokermogger
        </Link>

        {links.length > 0 ? (
          <nav aria-label="Page sections" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/login">Sign up</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
