CREATE TABLE "AppSession" (
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialVersion" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSession_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "AppSession_userId_idx" ON "AppSession"("userId");
CREATE INDEX "AppSession_expiresAt_idx" ON "AppSession"("expiresAt");
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "AuthRateLimit" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
