import { desc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { usersTable } from "../db";
import { ApiError } from "../utils/apiResponse";

export interface CreateUserInput {
  email: string;
  name: string;
}

export const createUser = async (input: CreateUserInput) => {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, input.email))
    .limit(1);

  if (existing) {
    throw new ApiError(409, "Email is already in use");
  }

  const [user] = await db.insert(usersTable).values(input).returning();
  return user;
};

export const listUsers = () =>
  db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
