import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { ApiResponse } from "../../common/http/api-response";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  idParamsSchema,
  jobIdParamsSchema,
  type IdParams,
  type JobIdParams,
} from "../../common/validation/id-params.schema";
import {
  CloudinaryService,
  type UploadSignature,
} from "../../media/cloudinary.service";
import { SessionGuard } from "../auth/session.guard";
import {
  createJobForSubjectSchema,
  createJobNewCustomerSchema,
  listJobsQuerySchema,
  updateJobSchema,
  type CreateJobForSubjectDto,
  type CreateJobNewCustomerDto,
  type ListJobsQuery,
  type UpdateJobDto,
} from "./jobs.schema";
import {
  JobsService,
  type Job,
  type JobCounts,
  type JobDetail,
  type JobSummary,
  type Payment,
} from "./jobs.service";
import {
  createPaymentSchema,
  idempotencyKeySchema,
  type CreatePaymentDto,
} from "./payments.schema";

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema, {
  message: "Invalid Idempotency-Key header",
  field: "Idempotency-Key",
});

@Controller("jobs")
@UseGuards(SessionGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get()
  async list(
    @Query(
      new ZodValidationPipe(listJobsQuerySchema, {
        message: "Invalid query parameters",
      }),
    )
    query: ListJobsQuery,
  ): Promise<ApiResponse<JobSummary[]>> {
    const { items, nextCursor } = await this.jobs.list(query);

    return new ApiResponse(200, "Jobs fetched successfully", items, {
      nextCursor,
    });
  }

  @Get("counts")
  async counts(): Promise<ApiResponse<JobCounts>> {
    return new ApiResponse(
      200,
      "Job counts fetched successfully",
      await this.jobs.counts(),
    );
  }

  @Get("signature")
  issueUploadSignature(): ApiResponse<UploadSignature> {
    return new ApiResponse(
      200,
      "Signature generated",
      this.cloudinary.createUploadSignature(),
    );
  }

  @Get(":id")
  async get(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
  ): Promise<ApiResponse<JobDetail>> {
    const job = await this.jobs.get(params.id);

    return new ApiResponse(200, "Job fetched successfully", job);
  }

  @Post("new-customer")
  async createForNewCustomer(
    @Body(new ZodValidationPipe(createJobNewCustomerSchema))
    body: CreateJobNewCustomerDto,
  ): Promise<ApiResponse<Job>> {
    const job = await this.jobs.createForNewCustomer(body);

    return new ApiResponse(201, "Job created successfully", job);
  }

  @Post(":id")
  async createForSubject(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Body(new ZodValidationPipe(createJobForSubjectSchema))
    body: CreateJobForSubjectDto,
  ): Promise<ApiResponse<Job>> {
    const job = await this.jobs.createForSubject(params.id, body);

    return new ApiResponse(201, "Job created successfully", job);
  }

  @Patch(":id")
  async update(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Body(new ZodValidationPipe(updateJobSchema))
    body: UpdateJobDto,
  ): Promise<ApiResponse<Job>> {
    const job = await this.jobs.update(params.id, body);

    return new ApiResponse(200, "Job updated successfully", job);
  }

  @Delete(":id")
  async delete(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
  ): Promise<ApiResponse<Job>> {
    const job = await this.jobs.delete(params.id);

    return new ApiResponse(200, "Job deleted successfully", job);
  }

  @Post(":jobId/payments")
  async createPayment(
    @Param(
      new ZodValidationPipe(jobIdParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: JobIdParams,
    @Body(new ZodValidationPipe(createPaymentSchema))
    body: CreatePaymentDto,
    @Headers("idempotency-key") rawIdempotencyKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiResponse<Payment>> {
    // The pipe either returns a string or throws the 400; the cast only re-states what the
    // schema already guarantees.
    const idempotencyKey = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as string;

    const { payment, replayed } = await this.jobs.createPayment(
      params.jobId,
      body,
      idempotencyKey,
    );

    // [11/12] A replay answers with the same 201 and the same body the first delivery produced,
    // so the client needs no special case. The header is metadata for anyone debugging a double
    // delivery: "this key had already been recorded, nothing was written now".
    if (replayed) reply.header("Idempotent-Replay", "true");

    return new ApiResponse(201, "Payment created successfully", payment);
  }
}
