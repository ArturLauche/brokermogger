# Scale path

The MVP uses a single PostgreSQL database for application data, sessions, rate-limit buckets and the job queue. That is intentional: no Redis, no BullMQ.

When an instance outgrows one node:

1. Run several app replicas against the same database. Sessions are in Postgres.
2. Run several workers. Job claim uses `FOR UPDATE SKIP LOCKED`.
3. Move evidence to S3-compatible storage (`STORAGE_BACKEND=s3`).
4. Put a reverse proxy in front and set `AUTH_TRUST_HOST=true`.
5. Keep one writer region for the audit hash chain.

Do not add a second job system. If the queue needs isolation, split workers by `JobType` first.
