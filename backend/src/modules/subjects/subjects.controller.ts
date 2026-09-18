import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { ApiResponse } from "../../common/http/api-response";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  idParamsSchema,
  type IdParams,
} from "../../common/validation/id-params.schema";
import {
  listQuerySchema,
  type ListQuery,
} from "../../common/validation/list-query.schema";
import { SessionGuard } from "../auth/session.guard";
import {
  createMeasurementSchema,
  type CreateMeasurementDto,
} from "./subjects.schema";
import {
  SubjectsService,
  type Measurement,
  type MeasurementSummary,
  type SubjectDetail,
} from "./subjects.service";

@Controller("subjects")
@UseGuards(SessionGuard)
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get(":id")
  async get(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
  ): Promise<ApiResponse<SubjectDetail>> {
    const subject = await this.subjects.get(params.id);

    return new ApiResponse(200, "Subject fetched successfully", subject);
  }

  @Get(":id/measurements")
  async listMeasurements(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Query(
      new ZodValidationPipe(listQuerySchema, {
        message: "Invalid query parameters",
      }),
    )
    query: ListQuery,
  ): Promise<ApiResponse<MeasurementSummary[]>> {
    const { items, nextCursor } = await this.subjects.listMeasurements(
      params.id,
      query,
    );

    return new ApiResponse(200, "Measurements fetched successfully", items, {
      nextCursor,
    });
  }

  @Post(":id/measurements")
  async createMeasurement(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Body(new ZodValidationPipe(createMeasurementSchema))
    body: CreateMeasurementDto,
  ): Promise<ApiResponse<Measurement>> {
    const measurement = await this.subjects.createMeasurement(params.id, body);

    return new ApiResponse(
      201,
      "Measurement created successfully",
      measurement,
    );
  }
}
