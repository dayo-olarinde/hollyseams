import { useQuery } from "@tanstack/react-query";
import { listMeasurements } from "@/lib/api/measurements";
import { keys } from "@/lib/query/keys";

/**
 * A person's fittings.
 *
 * Bodies do not change between two screens, so these are the longest-lived records in the app:
 * ten minutes of freshness, an hour in cache. The list is capped at the most recent 100 rows and
 * the UI only ever reads the newest, which is the API's own limit rather than a choice made here.
 */
export function useSubjectMeasurements(subjectId: string) {
  return useQuery({
    queryKey: keys.subjects.measurements(subjectId),
    queryFn: ({ signal }) => listMeasurements(subjectId, { limit: 100 }, signal),
    enabled: !!subjectId,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    select: (response) => response.data ?? [],
  });
}
