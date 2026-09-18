CREATE INDEX "subjects_customer_created_at_id_idx" ON "subjects" USING btree ("customer_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "measurements_subject_date_id_idx" ON "measurements" USING btree ("subject_id","date" DESC NULLS LAST,"id" DESC NULLS LAST);
