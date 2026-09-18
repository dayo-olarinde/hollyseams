import { PipeTransform } from "@nestjs/common";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../http/api-response";

export interface ZodValidationPipeOptions {
  message?: string;
  field?: string;
}

export class ZodValidationPipe<T extends ZodTypeAny>
  // `T` is a TypeScript generic representing the specific Zod schema passed to this pipe.
  // `extends ZodTypeAny` means: T can be any valid Zod schema type, but nothing else.
  implements PipeTransform
{
  constructor(
    // Store the specific Zod schema that this pipe will use for validation.
    // Example: new ZodValidationPipe(loginSchema) → T becomes the type of loginSchema.
    private readonly schema: T,

    // Optional settings controlling things like the validation error message.
    private readonly options: ZodValidationPipeOptions = {},
  ) {}

  transform(value: unknown): unknown {
    // Validate the incoming value against the schema without throwing; result tells us success/failure.
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Get custom options if provided, otherwise use "Validation failed".
      const { message = "Validation failed", field } = this.options;

      // Turn Zod's validation failure into our application's standard 400 error.
      throw new ApiError(
        400,
        message,

        // Convert Zod's individual validation issues into our API's FieldError format.
        result.error.issues.map((issue) => ({
          // Use the custom field name if supplied; otherwise derive it from Zod's path.
          // Example: ["user", "email"] → "user.email".
          field: field ?? issue.path.join("."),

          // Preserve Zod's human-readable explanation.
          message: issue.message,
        })),
      );
    }

    // Return the validated (and potentially transformed) data to the controller.
    return result.data;
  }
}
