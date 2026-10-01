"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  recordResponse,
  confirmResponse,
  linkResponse,
  deleteResponse,
} from "@/lib/responses/service";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";

export type RecordResponseFields = {
  requestId: string;
  submissionKey: string;
  receivedOn: string;
  fromAddress: string;
  subject: string;
  body: string;
  channel: string;
  evidenceFileId: string;
};
export type ConfirmResponseFields = {
  responseId: string;
  expectedRevision: string;
  expectedRequestStatus: string;
  classification: string;
  effect: string;
};
export type LinkResponseFields = {
  responseId: string;
  expectedRevision: string;
  requestId: string;
};

export async function recordResponseAction(
  _previous: ActionState<RecordResponseFields>,
  form: FormData
): Promise<ActionState<RecordResponseFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(form, "requestId"),
    submissionKey: formString(form, "submissionKey"),
    receivedOn: formString(form, "receivedOn"),
    fromAddress: formString(form, "fromAddress"),
    subject: formString(form, "subject"),
    body: formString(form, "body"),
    channel: formString(form, "channel"),
    evidenceFileId: formString(form, "evidenceFileId"),
  };
  let id: string;
  try {
    id = (
      await recordResponse(actor, {
        ...values,
        evidenceFileId: values.evidenceFileId || null,
      })
    ).id;
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/responses/${id}?saved=recorded`);
}

export async function confirmResponseAction(
  _previous: ActionState<ConfirmResponseFields>,
  form: FormData
): Promise<ActionState<ConfirmResponseFields>> {
  const actor = await requireActor();
  const values = {
    responseId: formString(form, "responseId"),
    expectedRevision: formString(form, "expectedRevision"),
    expectedRequestStatus: formString(form, "expectedRequestStatus"),
    classification: formString(form, "classification"),
    effect: formString(form, "effect"),
  };
  try {
    await confirmResponse(actor, {
      ...values,
      expectedRequestStatus: values.expectedRequestStatus || null,
      applyToRequest: values.effect === "apply",
      confirmationAccepted: formCheckbox(form, "confirmationAccepted"),
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/responses/${values.responseId}?saved=confirmed`);
}

export async function linkResponseAction(
  _previous: ActionState<LinkResponseFields>,
  form: FormData
): Promise<ActionState<LinkResponseFields>> {
  const actor = await requireActor();
  const values = {
    responseId: formString(form, "responseId"),
    expectedRevision: formString(form, "expectedRevision"),
    requestId: formString(form, "requestId"),
  };
  try {
    await linkResponse(actor, values);
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/responses/${values.responseId}?saved=matched`);
}

export async function deleteResponseAction(form: FormData) {
  const actor = await requireActor();
  await deleteResponse(actor, formString(form, "responseId"));
  redirect("/responses?deleted=1");
}
