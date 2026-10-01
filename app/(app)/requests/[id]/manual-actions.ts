"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  recordManualSubmission,
  reconcileDelivery,
  recordVerificationAction,
} from "@/lib/requests/manual";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";
import { recordRequestReceipt } from "@/lib/requests/receipt";

export type SubmissionFields = {
  requestId: string;
  snapshotId: string;
  submittedOn: string;
  receivedOn: string;
  evidenceFileId: string;
};
export type ReconciliationFields = {
  requestId: string;
  outboundEmailId: string;
  outcome: string;
  providerMessageId: string;
};
export type VerificationFields = { requestId: string; outcome: string };
export type ReceiptFields = {
  requestId: string;
  receivedOn: string;
  previousAnchorOn: string;
  previousBasis: string;
  confirmationAccepted: string;
};

export async function receiptAction(
  _previous: ActionState<ReceiptFields>,
  form: FormData
): Promise<ActionState<ReceiptFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(form, "requestId"),
    receivedOn: formString(form, "receivedOn"),
    previousAnchorOn: formString(form, "previousAnchorOn"),
    previousBasis: formString(form, "previousBasis"),
    confirmationAccepted: formString(form, "confirmationAccepted"),
  };
  try {
    await recordRequestReceipt(actor, {
      ...values,
      previousAnchorOn: values.previousAnchorOn || null,
      previousBasis: values.previousBasis || null,
      confirmationAccepted: formCheckbox(form, "confirmationAccepted"),
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/requests/${values.requestId}?saved=receipt`);
}

export async function submitManuallyAction(
  _previous: ActionState<SubmissionFields>,
  form: FormData
): Promise<ActionState<SubmissionFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(form, "requestId"),
    snapshotId: formString(form, "snapshotId"),
    submittedOn: formString(form, "submittedOn"),
    receivedOn: formString(form, "receivedOn"),
    evidenceFileId: formString(form, "evidenceFileId"),
  };
  try {
    await recordManualSubmission(actor, {
      ...values,
      receivedOn: values.receivedOn || null,
      evidenceFileId: values.evidenceFileId || null,
      confirmationAccepted: formCheckbox(form, "confirmationAccepted"),
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/requests/${values.requestId}?saved=submission`);
}

export async function reconcileDeliveryAction(
  _previous: ActionState<ReconciliationFields>,
  form: FormData
): Promise<ActionState<ReconciliationFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(form, "requestId"),
    outboundEmailId: formString(form, "outboundEmailId"),
    outcome: formString(form, "outcome"),
    providerMessageId: formString(form, "providerMessageId"),
  };
  try {
    await reconcileDelivery(actor, {
      ...values,
      providerMessageId: values.providerMessageId || null,
      confirmationAccepted: formCheckbox(form, "confirmationAccepted"),
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/requests/${values.requestId}?saved=reconciliation`);
}

export async function verificationAction(
  _previous: ActionState<VerificationFields>,
  form: FormData
): Promise<ActionState<VerificationFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(form, "requestId"),
    outcome: formString(form, "outcome"),
  };
  try {
    await recordVerificationAction(actor, {
      ...values,
      confirmationAccepted: formCheckbox(form, "confirmationAccepted"),
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/requests/${values.requestId}?saved=verification`);
}
