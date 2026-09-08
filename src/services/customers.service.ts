import { asc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { customersTable } from "../db";
import { ApiError } from "../utils/apiResponse";
import { keysetCondition } from "../utils/cursor";
import type {
  CreateCustomerInput,
  ListItemsQuery,
  UpdateCustomerInput,
} from "../validations/customers.validation";

export const listCustomers = async (
  { cursor, limit }: ListItemsQuery = { limit: 20 },
) => {
  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      phoneNumber: customersTable.phoneNumber,
    })
    .from(customersTable)
    .where(
      cursor
        ? keysetCondition(
            customersTable.name,
            customersTable.id,
            cursor,
            "text",
            ">",
          )
        : undefined,
    )
    .orderBy(asc(customersTable.name), asc(customersTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? `${last.name}|${last.id}` : null,
  };
};

export const createCustomer = async (customerData: CreateCustomerInput) => {
  const { name, phoneNumber } = customerData;

  const [customer] = await db
    .insert(customersTable)
    .values({
      name,
      ...(phoneNumber !== undefined && { phoneNumber }),
    })
    .returning();

  if (!customer) throw new ApiError(500, "Failed to create customer");

  return customer;
};

export const getCustomer = async (id: string) => {
  const [customer] = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      phoneNumber: customersTable.phoneNumber,
    })
    .from(customersTable)
    .where(eq(customersTable.id, id));

  if (!customer) throw new ApiError(404, "Customer not found");

  return customer;
};

export const updateCustomer = async (
  id: string,
  customerData: UpdateCustomerInput,
) => {
  if (Object.keys(customerData).length === 0) {
    throw new ApiError(400, "No fields to update");
  }

  const [customer] = await db
    .update(customersTable)
    .set(customerData)
    .where(eq(customersTable.id, id))
    .returning();

  if (!customer) throw new ApiError(404, "Customer not found");

  return customer;
};
