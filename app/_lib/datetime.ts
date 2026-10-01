import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { createDateFormatter } from "@/lib/format/datetime";
export const getDateFormatter = cache(async () =>
  createDateFormatter((await getSessionUser())?.timezone ?? "UTC")
);
