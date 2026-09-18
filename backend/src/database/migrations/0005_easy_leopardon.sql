DROP INDEX "jobs_created_at_id_idx";--> statement-breakpoint
CREATE INDEX "jobs_created_at_id_idx" ON "jobs" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);