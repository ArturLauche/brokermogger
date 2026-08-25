/**
 * Server wrapper that fills the public footer from instance settings and env.
 * Visual markup stays in `PublicFooter`.
 */
import { PublicFooter } from "@/components/layout/public-footer";
import { env } from "@/lib/config/env";
import { getPublicInstanceLinks } from "@/lib/config/runtimeSettings";

export async function InstancePublicFooter() {
  const props: {
    instanceName?: string;
    repositoryUrl?: string;
    documentationUrl?: string;
    securityContactEmail: string;
  } = {
    securityContactEmail: env.SECURITY_CONTACT_EMAIL,
  };

  try {
    const links = await getPublicInstanceLinks();
    if (links.displayName) props.instanceName = links.displayName;
    if (links.repositoryUrl) props.repositoryUrl = links.repositoryUrl;
    if (links.documentationUrl) props.documentationUrl = links.documentationUrl;
  } catch {
    // Build and offline renders keep the compiled defaults.
  }

  return <PublicFooter {...props} />;
}
