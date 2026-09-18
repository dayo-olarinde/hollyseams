import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { ApiResponse } from "../../common/http/api-response";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  idParamsSchema,
  type IdParams,
} from "../../common/validation/id-params.schema";
import { SessionGuard } from "../auth/session.guard";
import { listJobsQuerySchema, type ListJobsQuery } from "./jobs.schema";
import { JobsService, type JobSummary } from "./jobs.service";

@Controller("customers/:id/jobs")
@UseGuards(SessionGuard)
export class CustomerJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  async list(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,

    @Query(
      new ZodValidationPipe(listJobsQuerySchema, {
        message: "Invalid query parameters",
      }),
    )
    query: ListJobsQuery,
  ): Promise<ApiResponse<JobSummary[]>> {
    const { items, nextCursor } = await this.jobs.listForCustomer(
      params.id,
      query,
    );

    return new ApiResponse(200, "Jobs fetched successfully", items, {
      nextCursor,
    });
  }
}
