ALTER TABLE "VideoProject"
  ADD COLUMN "productionAt" TIMESTAMP(3),
  ADD COLUMN "deadlineAt" TIMESTAMP(3),
  ADD COLUMN "researchStartedAt" TIMESTAMP(3),
  ADD COLUMN "researchCompletedAt" TIMESTAMP(3),
  ADD COLUMN "productionStartedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "deadlineMissedAt" TIMESTAMP(3);
ALTER TABLE "ProductionJob" ADD COLUMN "availableAt" TIMESTAMP(3);
ALTER TABLE "ScheduleRule"
  ADD COLUMN "anchor" TEXT NOT NULL DEFAULT 'RESEARCH',
  ADD COLUMN "productionDelayMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "approvalBufferMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ContentIdea"
  ADD COLUMN "channelId" TEXT,
  ADD COLUMN "problem" TEXT,
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "channelFit" INTEGER,
  ADD COLUMN "feasibility" INTEGER,
  ADD COLUMN "feasibilityReason" TEXT,
  ADD COLUMN "estimatedCostCents" INTEGER,
  ADD COLUMN "estimateBasis" TEXT;
CREATE INDEX "ProductionJob_status_availableAt_idx" ON "ProductionJob"("status", "availableAt");
