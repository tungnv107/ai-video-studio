CREATE TABLE "WorkspaceOAuthApp" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "clientId" TEXT,
  "encryptedSecret" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceOAuthApp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceOAuthApp_platform_check" CHECK ("platform" IN ('youtube', 'tiktok')),
  CONSTRAINT "WorkspaceOAuthApp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceOAuthApp_workspaceId_platform_key" ON "WorkspaceOAuthApp"("workspaceId", "platform");
ALTER TABLE "WorkspaceOAuthApp" ENABLE ROW LEVEL SECURITY;
-- Setup grants separately so a new installation does not require the role to exist yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='studio_tenant') THEN
    CREATE POLICY studio_tenant_isolation ON "WorkspaceOAuthApp" TO studio_tenant
      USING ("workspaceId" = current_setting('app.workspace_id', true))
      WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceOAuthApp" TO studio_tenant;
  END IF;
END $$;
ALTER TABLE "SocialAccount" ADD COLUMN "oauthAppVersion" INTEGER;
ALTER TABLE "OAuthState" ADD COLUMN "oauthAppVersion" INTEGER;
ALTER TABLE "WebhookEvent" ADD COLUMN "workspaceId" TEXT, ADD COLUMN "oauthAppVersion" INTEGER;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "WebhookEvent_workspaceId_processedAt_idx" ON "WebhookEvent"("workspaceId", "processedAt");
