
export interface Measurement {
  id: string;
  subjectId: string;
  measurements: Record<string, number | null>;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeasurementInput {
  measurements: Record<string, number | null>;
  date: string;
}
