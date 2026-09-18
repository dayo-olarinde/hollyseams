import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerDto,
  type UpdateCustomerDto,
} from "./customers.schema";
import {
  CustomersService,
  type Customer,
  type CustomerSummary,
} from "./customers.service";

@Controller("customers")
@UseGuards(SessionGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  async list(
    @Query(
      new ZodValidationPipe(listQuerySchema, {
        message: "Invalid query parameters",
      }),
    )
    query: ListQuery,
  ): Promise<ApiResponse<CustomerSummary[]>> {
    const { items, nextCursor, totalCount } = await this.customers.list(query);

    return new ApiResponse(200, "Customers fetched successfully", items, {
      nextCursor,
      totalCount,
    });
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCustomerSchema))
    body: CreateCustomerDto,
  ): Promise<ApiResponse<Customer>> {
    const customer = await this.customers.create(body);

    return new ApiResponse(201, "Customer created successfully", customer);
  }

  @Get(":id")
  async get(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
  ): Promise<ApiResponse<CustomerSummary>> {
    const customer = await this.customers.get(params.id);

    return new ApiResponse(200, "Customer fetched successfully", customer);
  }

  @Patch(":id")
  async update(
    @Param(
      new ZodValidationPipe(idParamsSchema, {
        message: "Invalid route parameters",
      }),
    )
    params: IdParams,
    @Body(new ZodValidationPipe(updateCustomerSchema))
    body: UpdateCustomerDto,
  ): Promise<ApiResponse<Customer>> {
    const customer = await this.customers.update(params.id, body);

    return new ApiResponse(200, "Customer updated successfully", customer);
  }
}
