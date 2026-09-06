import type { Request, Response } from "express";
import { createUser, listUsers } from "../services/users.service";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const createUserHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await createUser(req.body as { email: string; name: string });
    res.status(201).json(new ApiResponse(201, "User created", user));
  },
);

export const listUsersHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const users = await listUsers();
    res.status(200).json(new ApiResponse(200, "success", users));
  },
);
