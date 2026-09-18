import { z } from "zod";

export const sessionSchema = z.strictObject({
  id: z.uuid("Session payload must contain a valid user UUID"),
});

export type SessionDto = z.infer<typeof sessionSchema>;
