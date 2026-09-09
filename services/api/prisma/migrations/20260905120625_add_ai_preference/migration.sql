-- Per-user answer-provider preference. Nullable: null means "use the server
-- default", so existing rows need no backfill and the columns stay meaningful
-- if a provider is later removed from the build.
ALTER TABLE "users" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "users" ADD COLUMN "aiModel" TEXT;
