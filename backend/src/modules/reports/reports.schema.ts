import { z } from "zod";

import { limitField } from "../../common/validation/list-query.schema";

export const topCustomersQuerySchema = z.strictObject({ limit: limitField });

export type TopCustomersQuery = z.infer<typeof topCustomersQuerySchema>;
