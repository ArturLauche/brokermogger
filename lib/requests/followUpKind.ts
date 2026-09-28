import { z } from "zod";

export const followUpKindSchema = z.enum(["FOLLOW_UP", "FINAL_REMINDER"]);
export type FollowUpKind = z.infer<typeof followUpKindSchema>;
