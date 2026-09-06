import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
});

export const userIdParamsSchema = z.object({
  id: z.string().uuid("Invalid user id"),
});
