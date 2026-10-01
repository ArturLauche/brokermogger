"use server";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  saveBroker,
  saveContact,
  saveCoverage,
  setBrokerSending,
} from "@/lib/admin/brokers";
import {
  brokerCommandSchema,
  contactCommandSchema,
  coverageCommandSchema,
  sendingCommandSchema,
} from "@/lib/admin/brokerCommands";
import type { ActorContext } from "@/lib/permissions/actor";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { formString } from "@/lib/validation/form";
import { isAppError } from "@/lib/core/errors";
import { createLogger } from "@/lib/observability/logger";

type State = ActionState<Record<string, string>>;
async function submit(
  data: FormData,
  keys: string[],
  operation: (actor: ActorContext, raw: unknown) => Promise<{ id: string }>,
  section: string
): Promise<State> {
  const actor = await requireActor();
  const values = Object.fromEntries(keys.map((key) => [key, formString(data, key)]));
  let id: string;
  try {
    id = (await operation(actor, values)).id;
  } catch (error) {
    if (!isAppError(error))
      createLogger("admin.brokers").error({ err: error }, "Catalogue command failed");
    return failedAction(error, values);
  }
  redirect(`/admin/brokers/${encodeURIComponent(id)}?saved=${section}#${section}`);
}
export async function saveBrokerAction(_: State, data: FormData) {
  return submit(data, Object.keys(brokerCommandSchema.shape), saveBroker, "details");
}
export async function saveContactAction(_: State, data: FormData) {
  return submit(data, Object.keys(contactCommandSchema.shape), saveContact, "contacts");
}
export async function saveCoverageAction(_: State, data: FormData) {
  return submit(data, Object.keys(coverageCommandSchema.shape), saveCoverage, "coverage");
}
export async function setSendingAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(sendingCommandSchema.shape),
    setBrokerSending,
    "sending"
  );
}
