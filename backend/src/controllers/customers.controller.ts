import type { Request, Response } from "express";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../services/customers.service";
import { ApiResponse } from "../utils/apiResponse";
import type {
  CreateCustomerInput,
  ListItemsQuery,
  UpdateCustomerInput,
} from "../validations/customers.validation";
import type { IdParams } from "../validations/params.validation";

export const listCustomersHandler = async (req: Request, res: Response) => {
  const query = req.query as unknown as ListItemsQuery;
  const { items, nextCursor } = await listCustomers(query);

  res.status(200).json(
    new ApiResponse(200, "Customers fetched successfully", items, {
      nextCursor,
    }),
  );
};

export const createCustomerHandler = async (req: Request, res: Response) => {
  const data = req.body as CreateCustomerInput;
  const customer = await createCustomer(data);

  res
    .status(201)
    .json(new ApiResponse(201, "Customer created successfully", customer));
};

export const getCustomerHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const customer = await getCustomer(id);

  res
    .status(200)
    .json(new ApiResponse(200, "Customer fetched successfully", customer));
};

export const updateCustomerHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const data = req.body as UpdateCustomerInput;
  const customer = await updateCustomer(id, data);

  res
    .status(200)
    .json(new ApiResponse(200, "Customer updated successfully", customer));
};
