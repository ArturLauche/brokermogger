import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { env } from "@/lib/config/env";
import { listAdminSettings } from "@/lib/db/repositories/adminSettings";
import { updateSettingAction } from "./actions";

export const metadata = { title: "Instance settings" };
const categories = {
  sending: "Sending",
  fair_use: "Fair use",
  follow_up: "Follow-ups",
  retention: "Retention",
  instance: "Instance details",
} as const;

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = await requireRole("INSTANCE_ADMIN");
  const settings = await listAdminSettings(actor);
  const { saved } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
      <PageHeader
        title="Instance settings"
        description="Operational limits and behavior for this instance. Changes in other app or worker processes take effect within 15 seconds; dispatch checks the sending switch directly."
      />
      {saved && settings.some((s) => s.key === saved) ? (
        <p role="status" className="text-sm">
          Setting saved.
        </p>
      ) : null}
      <p className="text-sm">
        External sending in deployment configuration is{" "}
        <strong>{env.ALLOW_EXTERNAL_SENDING ? "enabled" : "disabled"}</strong>. Provider:{" "}
        {env.EMAIL_PROVIDER}. A broker also needs verification, coverage, explicit
        approval and current consent. Enabling a switch never supplies user approval.
      </p>
      <nav aria-label="Setting groups" className="flex flex-wrap gap-4 text-sm">
        {Object.entries(categories).map(([key, label]) => (
          <a key={key} className="underline underline-offset-4" href={`#${key}`}>
            {label}
          </a>
        ))}
      </nav>
      {Object.entries(categories).map(([category, label]) => (
        <section
          key={category}
          id={category}
          className="scroll-mt-24 space-y-6"
          aria-labelledby={`${category}-heading`}
        >
          <h2 id={`${category}-heading`} className="text-xl font-semibold">
            {label}
          </h2>
          {settings
            .filter((s) => s.category === category)
            .map((setting) => (
              <div
                key={`${setting.key}:${setting.updatedAt}`}
                id={setting.key}
                className="scroll-mt-24 border-t pt-5"
              >
                {setting.invalid ? (
                  <p role="alert" className="mb-3 text-sm text-destructive">
                    The stored value is invalid; the compiled default is currently in use.
                    Save a valid value or restore the default.
                  </p>
                ) : null}
                <EditorForm
                  action={updateSettingAction}
                  initialValues={{
                    key: setting.key,
                    value: setting.value,
                    expectedUpdatedAt: setting.updatedAt,
                  }}
                  allowReset
                  fields={[
                    {
                      name: "value",
                      label: setting.key
                        .split(".")[1]!
                        .replaceAll("_", " ")
                        .replace(/^./, (c) => c.toUpperCase()),
                      description: `${setting.description} Default: ${setting.defaultValue || "empty"}.`,
                      kind:
                        setting.type === "boolean"
                          ? "select"
                          : setting.type === "number"
                            ? "number"
                            : "text",
                      ...(setting.type === "boolean"
                        ? {
                            options: [
                              { value: "false", label: "Disabled" },
                              { value: "true", label: "Enabled" },
                            ],
                          }
                        : {}),
                    },
                  ]}
                />
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
