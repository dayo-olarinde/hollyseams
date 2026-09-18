import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { ApiResponse } from "../../common/http/api-response";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SessionGuard } from "../auth/session.guard";
import {
  topCustomersQuerySchema,
  type TopCustomersQuery,
} from "./reports.schema";
import {
  ReportsService,
  type MonthlyRevenue,
  type OutstandingPayment,
  type TopCustomer,
} from "./reports.service";

@Controller("reports")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("monthly-revenue")
  async monthlyRevenue(): Promise<ApiResponse<MonthlyRevenue[]>> {
    const breakdown = await this.reports.monthlyRevenue();

    return new ApiResponse(200, "Monthly revenue retrieved", breakdown);
  }

  @Get("top-customers")
  async topCustomers(
    @Query(
      new ZodValidationPipe(topCustomersQuerySchema, {
        message: "Invalid query parameters",
      }),
    )
    query: TopCustomersQuery,
  ): Promise<ApiResponse<TopCustomer[]>> {
    const customers = await this.reports.topCustomers(query.limit);

    return new ApiResponse(200, "Top customers retrieved", customers);
  }

  @Get("outstanding-payments")
  async outstandingPayments(): Promise<ApiResponse<OutstandingPayment[]>> {
    const jobs = await this.reports.outstandingPayments();

    return new ApiResponse(200, "Outstanding payments retrieved", jobs);
  }
}
