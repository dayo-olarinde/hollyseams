import { Queue, Worker } from "bullmq";
import { logger } from "../config/logger";
import { bullMQConnection } from "../config/redis";

export interface ExampleJob {
  message: string;
}

const queueName = "hollyseams_example";

export const exampleQueue = new Queue<ExampleJob>(queueName, {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 10s, 20s between tries
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const worker = new Worker<ExampleJob>(
  queueName,
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "Example job processed");
  },
  { connection: bullMQConnection },
);

worker.on("failed", (job, err) =>
  logger.error({ jobId: job?.id, err }, "Example job failed"),
);

export const enqueueExample = (message: string) =>
  exampleQueue.add("example", { message });

export const closeQueueWorkers = async () => {
  await exampleQueue.close();
  await worker.close();
};
