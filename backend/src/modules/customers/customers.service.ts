import { Inject, Injectable } from "@nestjs/common";
import { asc, count, eq } from "drizzle-orm";

import { ApiError } from "../../common/http/api-response";
import {
  keysetCondition,
  pageRows,
  type Page,
} from "../../common/pagination/cursor";
import type { ListQuery } from "../../common/validation/list-query.schema";
import { customersTable } from "../../database";
import { DRIZZLE, type Database } from "../../database/database.module";
import type { CreateCustomerDto, UpdateCustomerDto } from "./customers.schema";

export type Customer = typeof customersTable.$inferSelect;

export interface CustomerSummary {
  id: string;
  name: string;
  phoneNumber: string | null;
}

@Injectable()
export class CustomersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list({ cursor, limit }: ListQuery): Promise<Page<CustomerSummary>> {
    // The header reads "12 clients · A→Z", and a cursor page cannot produce that 12. Both
    // statements run together rather than in sequence: a count has no dependency on the page.
    const [rows, [totals]] = await Promise.all([
      this.db
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
        .limit(limit + 1),
      this.db.select({ total: count() }).from(customersTable),
    ]);

    const { items, hasMore, last } = pageRows(rows, limit);

    return {
      items,
      nextCursor: hasMore && last ? `${last.name}|${last.id}` : null,
      totalCount: Number(totals?.total ?? 0),
    };
  }

  async create(customerData: CreateCustomerDto): Promise<Customer> {
    const { name, phoneNumber } = customerData;

    const [customer] = await this.db
      .insert(customersTable)
      .values({
        name,
        ...(phoneNumber !== undefined && { phoneNumber }),
      })
      .returning();

    if (!customer) throw new ApiError(500, "Failed to create customer");

    return customer;
  }

  async get(id: string): Promise<CustomerSummary> {
    const [customer] = await this.db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        phoneNumber: customersTable.phoneNumber,
      })
      .from(customersTable)
      .where(eq(customersTable.id, id));

    if (!customer) throw new ApiError(404, "Customer not found");

    return customer;
  }

  async update(id: string, customerData: UpdateCustomerDto): Promise<Customer> {
    if (Object.keys(customerData).length === 0) {
      throw new ApiError(400, "No fields to update");
    }

    const [customer] = await this.db
      .update(customersTable)
      .set(customerData)
      .where(eq(customersTable.id, id))
      .returning();

    if (!customer) throw new ApiError(404, "Customer not found");

    return customer;
  }
}
