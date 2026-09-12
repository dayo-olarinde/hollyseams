import { useQuery } from "@tanstack/react-query";
import { listMeasurements } from "@/lib/api/measurements";

export const subjectKeys = {
  all: ["subject"] as const,
  measurements: (subjectId: string) =>
    ["subject", subjectId, "measurements"] as const,
};

export function useSubjectMeasurements(subjectId: string) {
  return useQuery({
    queryKey: subjectKeys.measurements(subjectId),
    queryFn: () => listMeasurements(subjectId, { limit: 100 }),
    enabled: !!subjectId,
    select: (response) => response.data ?? [],
  });
}
