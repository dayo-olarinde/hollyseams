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

/**
 * A measurement value is either a single dimension (8.5 inches) or a PAIR of dimensions
 * recorded as "length/width" — tailors enter "8/8" for an 8-by-8 sleeve, so the API
 * accepts [8, 8]. Stored as-is in the JSONB column.
 */
const measurementNumber = z.coerce.number().finite().nonnegative().max(500);
export const measurementDataSchema = z.record(
  z.string(),
  z.union([measurementNumber, z.tuple([measurementNumber, measurementNumber])]),
);

export const createMeasurementSchema = z.strictObject({
  measurements: measurementDataSchema.refine(
    (entries) => Object.keys(entries).length > 0,
    "Provide at least one measurement",
  ),
  date: z.coerce.date(),
});

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export type CreateMeasurementDto = z.infer<typeof createMeasurementSchema>;
