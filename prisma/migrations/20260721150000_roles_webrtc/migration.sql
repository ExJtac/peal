-- Roles: ADMIN/OPERATOR -> ADMIN/MANAGER/USER (OPERATOR unused). Recreate the enum type.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "Role_old";

-- WebRTC (browser softphone) endpoints
ALTER TABLE "Extension" ADD COLUMN "webrtc" BOOLEAN NOT NULL DEFAULT false;
