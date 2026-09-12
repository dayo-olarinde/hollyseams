import { z } from "zod";

export const createSubjectSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters")
      .optional(),
    relationship: z
      .string()
      .trim()
      .min(1, "Relationship cannot be empty")
      .max(50, "Relationship must be at most 50 characters")
      .optional(),
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

export const measurementDataSchema = z.record(
  z.string(),
  z.coerce.number().finite().nonnegative(),
);

export const createMeasurementSchema = z.strictObject({
  measurements: measurementDataSchema.refine(
    (entries) => Object.keys(entries).length > 0,
    "Provide at least one measurement",
  ),
  date: z.coerce.date(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateMeasurementInput = z.infer<typeof createMeasurementSchema>;
