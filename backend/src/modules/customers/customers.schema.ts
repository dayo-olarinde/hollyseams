import { z } from "zod";

import {
  customerNameSchema,
  phoneNumberSchema,
} from "../../common/validation/customer-fields.schema";

export const createCustomerSchema = z.strictObject({
  name: customerNameSchema,
  phoneNumber: phoneNumberSchema.optional(),
});

export const updateCustomerSchema = z.strictObject({
  name: customerNameSchema.optional(),
  phoneNumber: phoneNumberSchema.optional(),
});

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
