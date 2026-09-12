# Product Brief — Tailor App (v1)

## Problem
My sister (a tailor) currently manages her business on paper and her phone:
- Customer measurements live in a notebook she frequently loses or has to search through.
- Finished-job photos are stored on her phone with no backup, and no link to the customer or job they belong to.
- She has no way to answer basic business questions: how much she made in a month, which customers haven't finished paying, and who her most valuable customers are.

## User
Single user — my sister. No multi-tenant concerns for v1.

## Goal (v1 "done")
She can:
- Log a customer along with their measurements.
- Record measurement history over time (not just the latest values).
- Create a job for a customer, attaching a style-reference photo and a finished-job photo.
- Record payments against a job, since jobs are commonly paid in parts (deposit + balance/installments).
- See total revenue for a given month.
- See which customers have outstanding (incomplete) payments on a job.
- See top customers, ranked by total amount paid.
- Know which jobs are completed but not yet delivered.

## Out of scope for v1
- Bulk-importing her existing notebook of customers.
- Multi-user/multi-tenant support.
- **Offline capture** — asked for in NFR1, deliberately deferred to v2 rather than cut. See
the "Deferred to v2" note in `02-requirements.md` for the rationale and what building it
requires.

## Photos
Stored in Cloudinary, referenced as arrays on the `jobs` table (style-reference photos, finished-job photos). Uploaded whenever she has a good connection, not necessarily at time of capture.
