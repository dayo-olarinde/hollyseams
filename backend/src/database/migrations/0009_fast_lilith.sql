ALTER TABLE "payments" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key");