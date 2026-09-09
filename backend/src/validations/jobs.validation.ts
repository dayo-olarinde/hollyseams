import { z } from "zod";
import { phoneNumberSchema } from "./customers.validation";

const jobMeasurementsSchema = z
  .record(z.string(), z.coerce.number().finite().nonnegative().nullable())
  .refine((entries) => Object.keys(entries).length > 0, {
    message: "Provide at least one measurement",
  });

const imageSchema = z.strictObject({
  url: z.url("Invalid image URL").max(2048, "Image URL is too long"),
  alt: z
    .string()
    .trim()
    .min(1, "Image alt text is required")
    .max(200, "Image alt text must be at most 200 characters"),
});

const jobPriceSchema = z.coerce
  .number()
  .finite("Agreed price must be a finite number")
  .nonnegative("Agreed price cannot be negative")
  .max(9999999999.99, "Agreed price must be at most 9999999999.99");

const jobStatusSchema = z.enum(["pending", "completed", "canceled"]);
const jobDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters");

// New jobs may omit a description, but PATCH requests must remain truly
// partial so an empty update cannot be accepted through a default value.
const createJobDescriptionSchema = jobDescriptionSchema.default("");

export const jobDataSchema = z.strictObject({
  styleRef: z
    .array(imageSchema)
    .max(10, "At most 10 style reference images")
    .default([]),
  finishedJob: z
    .array(imageSchema)
    .max(10, "At most 10 finished job images")
    .default([]),
  description: createJobDescriptionSchema,
  agreedPrice: jobPriceSchema,
  status: jobStatusSchema.default("pending"),
  dueDate: z.coerce.date().nullish(),
});

export const updateJobSchema = z
  .strictObject({
    styleRef: z
      .array(imageSchema)
      .max(10, "At most 10 style reference images")
      .optional(),
    finishedJob: z
      .array(imageSchema)
      .max(10, "At most 10 finished job images")
      .optional(),
    description: jobDescriptionSchema.optional(),
    agreedPrice: jobPriceSchema.optional(),
    status: jobStatusSchema.optional(),
    dueDate: z.coerce.date().nullish(),
    deliveredAt: z.coerce.date().nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const jobSubjectSchema = z
  .strictObject({
    relationship: z
      .string()
      .trim()
      .min(1, "Relationship cannot be empty")
      .max(50, "Relationship must be at most 50 characters")
      .default("self"),
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters")
      .optional(),
    measurements: jobMeasurementsSchema,
  })
  .superRefine((subject, ctx) => {
    if (subject.relationship !== "self" && !subject.name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: 'Subject name is required when relationship is not "self"',
      });
    }
  });

export const createJobNewCustomerSchema = z.strictObject({
  customer: z.strictObject({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters")
      .regex(
        /^[a-zA-Z]+(?:[ '-][a-zA-Z]+)*$/,
        "Name may only contain letters, spaces, apostrophes, and hyphens",
      ),
    phoneNumber: phoneNumberSchema.optional(),
  }),
  subjects: z
    .array(jobSubjectSchema)
    .length(1, "Exactly one subject is required per job"),
  job: jobDataSchema,
});

export const createJobForSubjectSchema = z.strictObject({
  measurementId: z.uuid("Invalid measurement id"),
  job: jobDataSchema,
});

export type JobDataInput = z.infer<typeof jobDataSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CreateJobNewCustomerInput = z.infer<
  typeof createJobNewCustomerSchema
>;
export type CreateJobForSubjectInput = z.infer<
  typeof createJobForSubjectSchema
>;
