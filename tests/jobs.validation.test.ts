import { describe, expect, it } from "vitest";
import {
  createJobForSubjectSchema,
  createJobNewCustomerSchema,
  updateJobSchema,
} from "../src/validations/jobs.validation";

const validMeasurements = { chest: 40, waist: null };

const validNewCustomerPayload = {
  customer: { name: "Ada Lovelace", phoneNumber: "+254712345678" },
  subjects: [
    {
      relationship: "self",
      measurements: validMeasurements,
    },
  ],
  job: {
    styleRef: [{ url: "https://example.com/a.jpg", alt: "front" }],
    finishedJob: [],
    agreedPrice: 2500,
    status: "pending",
  },
};

describe("createJobNewCustomerSchema", () => {
  it("accepts a valid payload with defaults applied", () => {
    const result = createJobNewCustomerSchema.parse(validNewCustomerPayload);

    expect(result.subjects).toHaveLength(1);
    expect(result.job.status).toBe("pending");
    expect(result.job.styleRef).toHaveLength(1);
    expect(result.job.dueDate).toBeUndefined();
  });

  it("accepts a non-self subject that carries its own name", () => {
    const result = createJobNewCustomerSchema.parse({
      ...validNewCustomerPayload,
      subjects: [
        {
          relationship: "daughter",
          name: "Ada Junior",
          measurements: validMeasurements,
        },
      ],
    });

    expect(result.subjects[0]?.name).toBe("Ada Junior");
  });

  it("resolves subject name from customer when relationship is self", () => {
    const result = createJobNewCustomerSchema.parse(validNewCustomerPayload);

    expect(result.subjects[0]?.name).toBeUndefined();
  });

  it("rejects a non-self subject without a name", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      subjects: [{ relationship: "daughter", measurements: validMeasurements }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than one subject", () => {
    const subject = validNewCustomerPayload.subjects[0];
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      subjects: [subject, subject],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty measurements record", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      subjects: [{ relationship: "self", measurements: {} }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative agreed price", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      job: { ...validNewCustomerPayload.job, agreedPrice: -1 },
    });

    expect(result.success).toBe(false);
  });

  it("accepts an agreed price above the old numeric(6,2) cap", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      job: { ...validNewCustomerPayload.job, agreedPrice: 10000 },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an agreed price above the numeric(12,2) column cap", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      job: { ...validNewCustomerPayload.job, agreedPrice: 10000000000 },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      job: { ...validNewCustomerPayload.job, status: "shipped" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const result = createJobNewCustomerSchema.safeParse({
      ...validNewCustomerPayload,
      coupon: "SAVE10",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateJobSchema", () => {
  it("accepts a partial update", () => {
    const result = updateJobSchema.parse({ status: "completed" });

    expect(result.status).toBe("completed");
  });

  it("accepts null to clear a date field", () => {
    const result = updateJobSchema.parse({ deliveredAt: null });

    expect(result.deliveredAt).toBeNull();
  });

  it("coerces ISO date strings into Dates", () => {
    const result = updateJobSchema.parse({ dueDate: "2026-10-01" });

    expect(result.dueDate).toBeInstanceOf(Date);
  });

  it("rejects an empty update", () => {
    const result = updateJobSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = updateJobSchema.safeParse({
      status: "completed",
      customerId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = updateJobSchema.safeParse({ status: "shipped" });

    expect(result.success).toBe(false);
  });
});

describe("createJobForSubjectSchema", () => {
  const validPayload = {
    measurementId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    job: {
      agreedPrice: 1500,
      dueDate: "2026-10-01",
    },
  };

  it("accepts a valid payload", () => {
    const result = createJobForSubjectSchema.parse(validPayload);

    expect(result.job.agreedPrice).toBe(1500);
    expect(result.job.dueDate).toBeInstanceOf(Date);
  });

  it("rejects a non-uuid measurementId", () => {
    const result = createJobForSubjectSchema.safeParse({
      ...validPayload,
      measurementId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});
