import { z } from "zod";
import { JOB_STATUS_FILTERS } from "../utils/jobs-filter";
import {
  listItemsQuerySchema,
  phoneNumberSchema,
} from "./customers.validation";

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

/**
 * Product rule: a job carries at most ONE style-reference image and ONE
 * finished-work image.
 *
 * The columns are jsonb ARRAYS — the storage shape supports many, and
 * jobs.service.ts derives each job's list cover from element [0] — but the
 * API contract exposes a single element per type. Raising this cap needs no
 * migration and no service change: only this number and the frontend's
 * MAX_PHOTOS (new-job-modal.tsx) move together.
 */
const MAX_IMAGES_PER_ARRAY = 1;

/** Error text for the cap above — kept next to it so the two never drift. */
const TOO_MANY_IMAGES =
  MAX_IMAGES_PER_ARRAY === 1
    ? "Only one image is allowed for this type"
    : `At most ${MAX_IMAGES_PER_ARRAY} images are allowed for this type`;

/** A photo list: an array holding at most the capped number of entries. */
const imageListSchema = z
  .array(imageSchema)
  .max(MAX_IMAGES_PER_ARRAY, TOO_MANY_IMAGES);

const jobStatusSchema = z.enum(["pending", "completed", "canceled"]);
const jobDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters");

const createJobDescriptionSchema = jobDescriptionSchema.default("");

export const jobDataSchema = z.strictObject({
  // Omitting either list is fine on create — it defaults to empty.
  styleRef: imageListSchema.default([]),
  finishedJob: imageListSchema.default([]),
  description: createJobDescriptionSchema,
  agreedPrice: jobPriceSchema,
  status: jobStatusSchema.default("pending"),
  dueDate: z.coerce.date().nullish(),
});

export const updateJobSchema = z
  .strictObject({
    // Optional, and an ABSENT list means "leave these photos alone" rather
    // than "remove them" — the service treats `[]` the same way, so the two
    // can never disagree about whether the old images should be released.
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

export const listJobsQuerySchema = listItemsQuerySchema.extend({
  status: z.enum(JOB_STATUS_FILTERS).optional(),
});

export type JobDataInput = z.infer<typeof jobDataSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CreateJobNewCustomerInput = z.infer<
  typeof createJobNewCustomerSchema
>;
export type CreateJobForSubjectInput = z.infer<
  typeof createJobForSubjectSchema
>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
