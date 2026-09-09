CREATE INDEX "subjects_customer_id_idx" ON "subjects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "measurements_subject_id_idx" ON "measurements" USING btree ("subject_id");