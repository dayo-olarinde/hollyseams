import type { Request, Response } from "express";
import {
  addSubject,
  createMeasurement,
  getSubject,
  listMeasurements,
  listSubjects,
} from "../services/subjects.service";
import { ApiResponse } from "../utils/apiResponse";
import type { ListItemsQuery } from "../validations/customers.validation";
import type { IdParams } from "../validations/params.validation";
import type {
  CreateMeasurementInput,
  CreateSubjectInput,
} from "../validations/subjects.validation";

export const listSubjectsHandler = async (req: Request, res: Response) => {
  const { id: customerId } = req.params as IdParams;
  const query = req.query as unknown as ListItemsQuery;
  const { items, nextCursor } = await listSubjects(customerId, query);

  res.status(200).json(
    new ApiResponse(200, "Subjects fetched successfully", items, {
      nextCursor,
    }),
  );
};

export const addSubjectsHandler = async (req: Request, res: Response) => {
  const { id: customerId } = req.params as IdParams;
  const data = req.body as CreateSubjectInput;
  const subject = await addSubject(customerId, data);

  res
    .status(201)
    .json(new ApiResponse(201, "Subject created successfully", subject));
};

export const createMeasurementHandler = async (req: Request, res: Response) => {
  const { id: subjectId } = req.params as IdParams;
  const data = req.body as CreateMeasurementInput;
  const measurement = await createMeasurement(subjectId, data);

  res
    .status(201)
    .json(
      new ApiResponse(201, "Measurement created successfully", measurement),
    );
};

export const listMeasurementsHandler = async (req: Request, res: Response) => {
  const { id: subjectId } = req.params as IdParams;
  const query = req.query as unknown as ListItemsQuery;
  const { items, nextCursor } = await listMeasurements(subjectId, query);

  res.status(200).json(
    new ApiResponse(200, "Measurements fetched successfully", items, {
      nextCursor,
    }),
  );
};

export const getSubjectHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const subject = await getSubject(id);

  res
    .status(200)
    .json(new ApiResponse(200, "Subject fetched successfully", subject));
};
