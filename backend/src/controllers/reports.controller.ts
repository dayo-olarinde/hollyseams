import type { Request, Response } from "express";
import {
  monthlyRevenue,
  outstandingPayments,
  topCustomers,
} from "../services/reports.service";
import { ApiResponse } from "../utils/apiResponse";
import type { TopCustomersQuery } from "../validations/reports.validation";

export const monthlyRevenueHandler = async (_req: Request, res: Response) => {
  const breakdown = await monthlyRevenue();

  res
    .status(200)
    .json(new ApiResponse(200, "Monthly revenue retrieved", breakdown));
};

export const topCustomersHandler = async (req: Request, res: Response) => {
  const { limit } = req.query as unknown as TopCustomersQuery;
  const customers = await topCustomers(limit);

  res
    .status(200)
    .json(new ApiResponse(200, "Top customers retrieved", customers));
};

export const outstandingPaymentsHandler = async (
  _req: Request,
  res: Response,
) => {
  const jobs = await outstandingPayments();

  res
    .status(200)
    .json(new ApiResponse(200, "Outstanding payments retrieved", jobs));
};
