import { describe, expect, it } from "vitest";
import { createSubjectSchema } from "../src/validations/subjects.validation";

describe("createSubjectSchema", () => {
  it("accepts a self subject with no name (server fills it from the customer)", () => {
    const result = createSubjectSchema.parse({ relationship: "self" });

    expect(result.relationship).toBe("self");
    expect(result.name).toBeUndefined();
  });

  it("accepts a self subject that also carries a name", () => {
    const result = createSubjectSchema.parse({
      name: "Ada Lovelace",
      relationship: "self",
    });

    expect(result.name).toBe("Ada Lovelace");
  });

  it("accepts a non-self subject with a name", () => {
    const result = createSubjectSchema.parse({
      name: "Zainab",
      relationship: "daughter",
    });

    expect(result.name).toBe("Zainab");
  });

  it("rejects a non-self subject without a name", () => {
    const result = createSubjectSchema.safeParse({ relationship: "daughter" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Subject name is required when relationship is not "self"',
      );
    }
  });

  it("rejects a subject with neither name nor relationship", () => {
    const result = createSubjectSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = createSubjectSchema.safeParse({
      name: "Zainab",
      customerId: "not-allowed",
    });

    expect(result.success).toBe(false);
  });
});
