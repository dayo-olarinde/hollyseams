import { describe, expect, it } from "vitest";

import type { Env } from "../src/config/env.schema";
import { CloudinaryService } from "../src/media/cloudinary.service";
import { PHOTO_CLEANUP_JOB_OPTIONS } from "../src/media/photo-cleanup.service";
import { fakeCloudinary } from "./helpers/fakes";

/**
 * Unit tests for the photo cleanup path, without starting Nest or opening Redis.
 *
 * Two things are pinned here, and they are the two halves of "the delete can actually be
 * retried":
 *
 * 1. `CloudinaryService.destroy` **rejects** when the provider refuses — a delete that
 *    swallowed its own failure would be indistinguishable from a successful one, and BullMQ
 *    only retries what throws. The real service runs against the fake SDK, so the checks are
 *    the production ones.
 * 2. The queue's retry policy is what was asked for. `PHOTO_CLEANUP_JOB_OPTIONS` is asserted
 *    rather than exercised because a Worker needs a live Redis; the value is the contract.
 */

const testEnv = {
  CLOUDINARY_UPLOAD_FOLDER: "hollyseams/photos",
} as unknown as Env;

const A = "hollyseams/photos/a";
const B = "hollyseams/photos/b";

describe("CloudinaryService.destroy", () => {
  it("resolves when the provider releases every photo", async () => {
    const cloud = fakeCloudinary();
    const service = new CloudinaryService(cloud.client, testEnv);

    await expect(service.destroy([A, B])).resolves.toBeUndefined();
    expect(cloud.destroyed).toEqual([A, B]);
  });

  it("rejects with 502 so the queued job is retried instead of reported as done", async () => {
    const cloud = fakeCloudinary({ destroyFails: true });
    const service = new CloudinaryService(cloud.client, testEnv);

    await expect(service.destroy([A, B])).rejects.toMatchObject({
      statusCode: 502,
      message: `Could not delete photos with the image provider: ${A}, ${B}`,
    });
    // Both ids were attempted: one refused asset must not stop the other from being released.
    expect(cloud.destroyed).toEqual([A, B]);
  });

  it("resolves for an empty list without calling the provider", async () => {
    const cloud = fakeCloudinary();
    const service = new CloudinaryService(cloud.client, testEnv);

    await expect(service.destroy([])).resolves.toBeUndefined();
    expect(cloud.destroyed).toEqual([]);
  });
});

describe("photo cleanup queue policy", () => {
  it("asks for 5 retries with exponential backoff", () => {
    // BullMQ counts the first try as an attempt, so 5 retries is 6 attempts: 5s, 10s, 20s,
    // 40s and 80s apart.
    expect(PHOTO_CLEANUP_JOB_OPTIONS.attempts).toBe(6);
    expect(PHOTO_CLEANUP_JOB_OPTIONS.backoff).toEqual({
      type: "exponential",
      delay: 5_000,
    });
  });

  it("caps the jobs it keeps, so the queue does not grow forever", () => {
    expect(PHOTO_CLEANUP_JOB_OPTIONS.removeOnComplete).toEqual({ count: 100 });
    expect(PHOTO_CLEANUP_JOB_OPTIONS.removeOnFail).toEqual({ count: 100 });
  });
});
