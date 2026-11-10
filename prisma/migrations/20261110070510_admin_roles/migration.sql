-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('manager', 'staff');

-- AlterTable
ALTER TABLE "admin_user" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "admin_role" NOT NULL DEFAULT 'staff';

-- 이 마이그레이션 전에 있던 계정은 모두 서버 명령으로 만든 우리 팀 계정 → 계정 관리자
UPDATE "admin_user" SET "role" = 'manager';
