import { z } from "zod";

export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters")
  .regex(
    /^[a-zA-Z]+(?:[ '-][a-zA-Z]+)*$/,
    "Name may only contain letters, spaces, apostrophes, and hyphens",
  );

export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "Phone number must be 7–15 digits with an optional leading +",
  );

export const createCustomerSchema = z.strictObject({
  name: customerNameSchema,
  phoneNumber: phoneNumberSchema.optional(),
});

export const updateCustomerSchema = z.strictObject({
  name: customerNameSchema.optional(),
  phoneNumber: phoneNumberSchema.optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
