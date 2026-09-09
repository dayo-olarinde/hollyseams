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
  const job = await createJobNewCustomer(data);

  res.status(201).json(new ApiResponse(201, "Job created successfully", job));
};

export const createJobForSubjectHandler = async (
  req: Request,
  res: Response,
) => {
  const { id: subjectId } = req.params as IdParams;
  const data = req.body as CreateJobForSubjectInput;
  const job = await createJobForSubject(subjectId, data);

  res.status(201).json(new ApiResponse(201, "Job created successfully", job));
};

export const updateJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const data = req.body as UpdateJobInput;
  const job = await updateJob(id, data);

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
