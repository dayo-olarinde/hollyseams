import { z } from "zod";

import {
  customerNameSchema,
  phoneNumberSchema,
} from "../../common/validation/customer-fields.schema";
import { listQuerySchema } from "../../common/validation/list-query.schema";
import { JOB_STATUS_FILTERS } from "./job-status-filter";

const jobMeasurementsSchema = z
  .record(z.string(), z.coerce.number().finite().nonnegative().nullable())
  .refine((entries) => Object.keys(entries).length > 0, {
    message: "Provide at least one measurement",
  });

const imageSchema = z.strictObject({
  publicId: z
    .string()
    .trim()
    .min(1, "Image public id is required")
    .max(255, "Image public id must be at most 255 characters"),
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

const MAX_IMAGES_PER_ARRAY = 1;

const TOO_MANY_IMAGES =
  MAX_IMAGES_PER_ARRAY === 1
    ? "Only one image is allowed for this type"
    : `At most ${MAX_IMAGES_PER_ARRAY} images are allowed for this type`;

const imageListSchema = z
  .array(imageSchema)
  .max(MAX_IMAGES_PER_ARRAY, TOO_MANY_IMAGES);

const jobStatusSchema = z.enum(["pending", "completed", "canceled"]);
const jobDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters");

export const jobDataSchema = z.strictObject({
  styleRef: imageListSchema.default([]),
  finishedJob: imageListSchema.default([]),
  description: jobDescriptionSchema.default(""),
  agreedPrice: jobPriceSchema,
  status: jobStatusSchema.default("pending"),
  dueDate: z.coerce.date().nullish(),
});

export const updateJobSchema = z
  .strictObject({
    styleRef: imageListSchema.optional(),
    finishedJob: imageListSchema.optional(),
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
    name: customerNameSchema,
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

export const listJobsQuerySchema = listQuerySchema.extend({
  status: z.enum(JOB_STATUS_FILTERS).optional(),
});

export type JobDataDto = z.infer<typeof jobDataSchema>;
export type UpdateJobDto = z.infer<typeof updateJobSchema>;
export type CreateJobNewCustomerDto = z.infer<
  typeof createJobNewCustomerSchema
>;
export type CreateJobForSubjectDto = z.infer<typeof createJobForSubjectSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
