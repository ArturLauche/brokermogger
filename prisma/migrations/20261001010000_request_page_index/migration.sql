-- Apply in the documented maintenance window, before restarting dispatch.
-- Supports ownership-scoped chronological pages without scanning newer rows.
CREATE INDEX "RemovalRequest_userId_createdAt_id_idx"
  ON "RemovalRequest" ("userId", "createdAt", "id");
