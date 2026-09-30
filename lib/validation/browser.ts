import { z } from "zod";

// Configure before dependent schemas are constructed. Zod's caught eval probe
// still violates a strict CSP; its interpreter performs the same validation.
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
