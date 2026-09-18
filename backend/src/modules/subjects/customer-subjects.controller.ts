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
import { createSubjectSchema, type CreateSubjectDto } from "./subjects.schema";
import {
  SubjectsService,
  type Subject,
  type SubjectSummary,
} from "./subjects.service";

@Controller("customers/:id/subjects")
@UseGuards(SessionGuard)
export class CustomerSubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  async list(
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
  ): Promise<ApiResponse<SubjectSummary[]>> {
    const { items, nextCursor } = await this.subjects.list(params.id, query);

    return new ApiResponse(200, "Subjects fetched successfully", items, {
      nextCursor,
    });
  }

  @Post()
  async create(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Body(new ZodValidationPipe(createSubjectSchema))
    body: CreateSubjectDto,
  ): Promise<ApiResponse<Subject>> {
    const subject = await this.subjects.create(params.id, body);

    return new ApiResponse(201, "Subject created successfully", subject);
  }
}
