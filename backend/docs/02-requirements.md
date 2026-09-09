# Requirements — Tailor App (v1)

## Functional Requirements
1. The user can create a customer record with name, contact info.
2. The user can create one or more subjects under a customer (e.g. herself, her children) — the person a garment is actually for, separate from who pays.
3. The user can create a job linked to a customer (payer) and a subject (who it's for), with an option to update measurements if the subject already exists, style-reference photos, finished-job photos, and an agreed price.
4. The user can record more than one payment against a job (deposit, balance, installments).
5. When a subject's measurements are updated, old measurements are not overwritten — history is kept.
6. The user can view a subject's measurement history over time.
7. The user can calculate total revenue for a given month.
8. The user can see jobs where total payments are less than the job's agreed price (outstanding payments).
9. The system can rank customers by total amount paid.
10. The user can mark a job as delivered, independent of its completed/pending/canceled status.

## Non-Functional Requirements
1. **Availability** — the user can create jobs and attach photos with poor connectivity, syncing later when a connection is available.
2. **Performance** — monthly revenue and top-customer queries return quickly even as row counts grow.
3. **Durability** — photos must not be lost after upload (Cloudinary).
4. **Usability** — the UI is easy to navigate, with clear error messages, since the user is not technical.
5. **Security** — PIN-based login (Argon2 + pepper) with Redis-backed, rate-limited sessions. Chosen over email/password, OAuth, or JWT because the app is single-user and the real threat is casual access (e.g. phone picked up by someone else), not a sophisticated attacker.
