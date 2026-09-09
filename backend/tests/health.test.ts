import { describe, expect, it } from "vitest";
import { ApiError, ApiResponse } from "../src/utils/apiResponse";

describe("ApiResponse", () => {
  it("marks success based on status code", () => {
    expect(new ApiResponse(200).success).toBe(true);
    expect(new ApiResponse(404).success).toBe(false);
  });
});

describe("ApiError", () => {
  it("is operational and captures the message", () => {
    const err = new ApiError(400, "bad input");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("bad input");
    expect(err.isOperational).toBe(true);
  });
});
