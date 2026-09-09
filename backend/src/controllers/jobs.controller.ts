import type { Request, Response } from "express";
import {
  createJobForSubject,
  createJobNewCustomer,
  createPayment,
  deleteJob,
  getJob,
  listCustomerJobs,
  listJobs,
  updateJob,
} from "../services/jobs.service";
import { ApiResponse } from "../utils/apiResponse";
import type { ListJobsQuery } from "../validations/jobs.validation";
import type {
  CreateJobForSubjectInput,
  CreateJobNewCustomerInput,
  UpdateJobInput,
} from "../validations/jobs.validation";
import type { IdParams, JobIdParams } from "../validations/params.validation";
import type { CreatePaymentInput } from "../validations/payments.validation";
import { cloudinary } from "../config/cloudinary";
import { env } from "../config/env";
import {
  destroyPhotos,
  verifyAndResolvePhotos,
} from "../services/cloudinary.service";

export const listJobsHandler = async (req: Request, res: Response) => {
  const query = req.query as unknown as ListJobsQuery;
  const { items, nextCursor } = await listJobs(query);

  res.status(200).json(
    new ApiResponse(200, "Jobs fetched successfully", items, {
      nextCursor,
    }),
  );
};

export const listCustomerJobsHandler = async (req: Request, res: Response) => {
  const { id: customerId } = req.params as IdParams;
  const query = req.query as unknown as ListJobsQuery;
  const { items, nextCursor } = await listCustomerJobs(customerId, query);

  res.status(200).json(
    new ApiResponse(200, "Jobs fetched successfully", items, {
      nextCursor,
    }),
  );
};

export const getJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const job = await getJob(id);

  res.status(200).json(new ApiResponse(200, "Job fetched successfully", job));
};

export const createJobNewCustomerHandler = async (
  req: Request,
  res: Response,
) => {
  const data = req.body as CreateJobNewCustomerInput;
  const { styleRef, finishedJob, ...rest } = data.job;

  // Photos on a new job are freshly uploaded assets — verify each against
  // Cloudinary and persist only server-derived URLs (see cloudinary.service).
  // The arrays are always present (schema defaults them to []), so the
  // notNull jsonb columns are always written; empty arrays make no API calls.
  const job = await createJobNewCustomer({
    ...data,
    job: {
      ...rest,
      styleRef: await verifyAndResolvePhotos(styleRef),
      finishedJob: await verifyAndResolvePhotos(finishedJob),
    },
  });

  res.status(201).json(new ApiResponse(201, "Job created successfully", job));
};

export const createJobForSubjectHandler = async (
  req: Request,
  res: Response,
) => {
  const { id: subjectId } = req.params as IdParams;
  const data = req.body as CreateJobForSubjectInput;
  const { styleRef, finishedJob, ...rest } = data.job;

  const job = await createJobForSubject(subjectId, {
    ...data,
    job: {
      ...rest,
      styleRef: await verifyAndResolvePhotos(styleRef),
      finishedJob: await verifyAndResolvePhotos(finishedJob),
    },
  });

  res.status(201).json(new ApiResponse(201, "Job created successfully", job));
};

export const updateJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const { styleRef, finishedJob, ...scalars } = req.body as UpdateJobInput;

  if (!styleRef && !finishedJob) {
    const job = await updateJob(id, scalars);
    res.status(200).json(new ApiResponse(200, "Job updated successfully", job));
    return;
  }

  // Photo updates verify the incoming assets against Cloudinary, persist
  // server-derived URLs, then destroy whatever this update dropped — but
  // only after the DB write succeeds, so cleanup can never lose job data.
  const current = await getJob(id);
  const [resolvedStyleRef, resolvedFinishedJob] = await Promise.all([
    styleRef?.length ? verifyAndResolvePhotos(styleRef) : undefined,
    finishedJob?.length ? verifyAndResolvePhotos(finishedJob) : undefined,
  ]);

  const job = await updateJob(id, {
    ...scalars,
    ...(resolvedStyleRef && { styleRef: resolvedStyleRef }),
    ...(resolvedFinishedJob && { finishedJob: resolvedFinishedJob }),
  });

  const removed: string[] = [];
  for (const [incoming, currentPhotos] of [
    [styleRef, current.styleRef],
    [finishedJob, current.finishedJob],
  ] as const) {
    if (!incoming) continue;
    const kept = new Set(incoming.map((p) => p.publicId));
    for (const photo of currentPhotos ?? []) {
      if (photo.publicId && !kept.has(photo.publicId)) removed.push(photo.publicId);
    }
  }
  await destroyPhotos(removed);

  res.status(200).json(new ApiResponse(200, "Job updated successfully", job));
};

export const deleteJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const current = await getJob(id); // 404 before touching Cloudinary
  const job = await deleteJob(id); // 409 when payments exist — nothing deleted

  // Only after the row is gone: release its Cloudinary assets (best-effort).
  const publicIds = [...(current.styleRef ?? []), ...(current.finishedJob ?? [])]
    .flatMap((photo) => (photo.publicId ? [photo.publicId] : []));
  await destroyPhotos(publicIds);

  res.status(200).json(new ApiResponse(200, "Job deleted successfully", job));
};

export const createPaymentHandler = async (req: Request, res: Response) => {
  const { jobId } = req.params as JobIdParams;
  const data = req.body as CreatePaymentInput;
  const payment = await createPayment(jobId, data);

  res
    .status(201)
    .json(new ApiResponse(201, "Payment created successfully", payment));
};

export const getUploadSignature = (_req: Request, res: Response) => {
  const timestamp = Math.round(Date.now() / 1000);
  // Short-lived so a leaked signature cannot be replayed forever.
  const expiresAt = timestamp + 15 * 60;
  const folder = env.CLOUDINARY_UPLOAD_FOLDER;
  const resourceType = "image";

  // Cloudinary's server computes the signature over ONLY {timestamp, folder}
  // — it excludes resource_type and expires_at from the string to sign
  // (verified empirically: "Invalid Signature", string-to-sign shown as
  // 'folder=...&timestamp=...'). Over-signing extra params makes every
  // upload fail, so sign exactly what the server signs. The extra params
  // are still SENT in the upload request — resource_type restricts to
  // images, expires_at bounds the upload window — but must not be signed.
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET,
  );

  res.json(
    new ApiResponse(200, "Signature generated", {
      signature,
      timestamp,
      expiresAt,
      folder,
      resourceType,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
    }),
  );
};
