/**
 * Public product identity that is safe to import from server and client code.
 *
 * Secrets, operator overrides and `APP_BASE_URL` live in `env` and in runtime
 * system settings. This module only holds the names and default public URLs of
 * the open source project itself.
 */
export const SITE_NAME = "Brokermogger";

export const SITE_TAGLINE = "Prepare, approve and track your own privacy requests";

export const SITE_DESCRIPTION =
  "Brokermogger is a free and open source privacy request desk. It prepares privacy requests to data brokers, shows you the exact text, and sends nothing without your approval.";

export const SITE_SHORT_DESCRIPTION =
  "Prepare, approve and track your own privacy requests. Free, open source and self hostable.";

export const DEFAULT_REPOSITORY_URL = "https://github.com/ArturLauche/brokermogger";

export const DEFAULT_DOCUMENTATION_URL =
  "https://github.com/ArturLauche/brokermogger#readme";

export const LICENSE_NAME = "AGPL-3.0-or-later";

export const DEFAULT_SECURITY_CONTACT = "security@example.invalid";
