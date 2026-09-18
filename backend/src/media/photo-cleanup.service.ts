import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Queue, Worker, type DefaultJobOptions, type Job } from "bullmq";

import { ENV, type Env } from "../config/env.schema";
import { CloudinaryService } from "./cloudinary.service";

const QUEUE_NAME = "photo-cleanup";
const KEY_PREFIX = "hollyseams";

const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 5_000;

// One job's photos are deleted in parallel, so a few jobs can run at once without idling.
const CONCURRENCY = 5;

interface PhotoCleanupJob {
  publicIds: string[];
}

export const PHOTO_CLEANUP_JOB_OPTIONS: DefaultJobOptions = {
  attempts: MAX_RETRIES + 1,
  backoff: { type: "exponential", delay: RETRY_BASE_DELAY_MS },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
};

@Injectable()
export class PhotoCleanupService implements OnApplicationShutdown {
  private readonly logger = new Logger(PhotoCleanupService.name);

  private readonly queue: Queue<PhotoCleanupJob>;
  private readonly worker: Worker<PhotoCleanupJob>;

  constructor(
    @Inject(ENV) env: Env,
    private readonly cloudinary: CloudinaryService,
  ) {
    const connection = { url: env.REDIS_URL };

    this.queue = new Queue<PhotoCleanupJob>(QUEUE_NAME, {
      connection,
      prefix: KEY_PREFIX,
      defaultJobOptions: PHOTO_CLEANUP_JOB_OPTIONS,
    });

    this.worker = new Worker<PhotoCleanupJob>(
      QUEUE_NAME,
      (job) => this.destroyPhotos(job),
      { connection, prefix: KEY_PREFIX, concurrency: CONCURRENCY },
    );

    this.queue.on("error", (error) => this.logConnectionError("Queue", error));
    this.worker.on("error", (error) =>
      this.logConnectionError("Worker", error),
    );
    this.worker.on("failed", (job, error) => this.logJobFailure(job, error));
  }

  async enqueueDestroy(publicIds: string[]): Promise<void> {
    if (publicIds.length === 0) return;

    try {
      await this.queue.add("destroy", { publicIds });
    } catch (error) {
      this.logger.error(
        `Could not queue photo cleanup for ${publicIds.join(", ")}: ${String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async destroyPhotos(job: Job<PhotoCleanupJob>): Promise<void> {
    await this.cloudinary.destroy(job.data.publicIds);
  }

  private logJobFailure(
    job: Job<PhotoCleanupJob> | undefined,
    error: Error,
  ): void {
    const ids = job?.data.publicIds.join(", ") ?? "(unknown ids)";
    const attempts = job?.attemptsMade ?? 0;

    if (attempts > MAX_RETRIES) {
      this.logger.error(
        `Giving up on photo cleanup for ${ids} after ${attempts} attempts: ${String(error)} — these assets are orphaned in Cloudinary`,
      );
      return;
    }

    this.logger.warn(
      `Photo cleanup attempt ${attempts} failed for ${ids}, retrying: ${String(error)}`,
    );
  }

  private logConnectionError(client: string, error: Error): void {
    this.logger.error(`BullMQ ${client} connection error: ${String(error)}`);
  }
}
