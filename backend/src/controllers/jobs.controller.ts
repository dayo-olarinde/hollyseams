import type { Request, Response } from "express";
import { cloudinary } from "../config/cloudinary";
import { env } from "../config/env";
import { verifyAndResolvePhotos } from "../services/cloudinary.service";
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
import type {
  CreateJobForSubjectInput,
  CreateJobNewCustomerInput,
  ListJobsQuery,
  UpdateJobInput,
} from "../validations/jobs.validation";
import type { IdParams, JobIdParams } from "../validations/params.validation";
import type { CreatePaymentInput } from "../validations/payments.validation";

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
  const job = await updateJob(id, req.body as UpdateJobInput);

  res.status(200).json(new ApiResponse(200, "Job updated successfully", job));
};

export const deleteJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const job = await deleteJob(id);

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
  const expiresAt = timestamp + 15 * 60;
  const folder = env.CLOUDINARY_UPLOAD_FOLDER;
  const resourceType = "image";

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
