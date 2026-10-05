import { PipeTransform } from "@nestjs/common";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../http/api-response";

export interface ZodValidationPipeOptions {
  message?: string;
  field?: string;
}

export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(
    private readonly schema: T,
    private readonly options: ZodValidationPipeOptions = {},
  ) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const { message = "Validation failed", field } = this.options;

      throw new ApiError(
        400,
        message,
        result.error.issues.map((issue) => ({
          field: field ?? issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    return result.data;
  }
}
