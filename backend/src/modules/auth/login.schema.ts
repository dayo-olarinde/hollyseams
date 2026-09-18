import { z } from "zod";

export const loginSchema = z.strictObject({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export type LoginDto = z.infer<typeof loginSchema>;
