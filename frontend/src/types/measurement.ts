
import type { MeasurementValue } from "@/lib/measurement-input";

export interface Measurement {
  id: string;
  subjectId: string;
  measurements: Record<string, MeasurementValue | null>;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeasurementInput {
  measurements: Record<string, MeasurementValue | null>;
  date: string;
}
