/** Stable public API. Each workflow owns a focused service and repository transaction. */
export { generateRequests, type GenerateInput } from "./generation";
export { approveRequest } from "./approval";
export { sendApprovedRequest } from "./dispatch";
export { returnRequestToDraft, closeRequest, markRequestCompleted } from "./actions";
export { markNoResponse, applyDeliveryOutcome } from "./responses";
export { prepareFollowUp, prepareFollowUpDraft } from "./followUp";
