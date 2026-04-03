DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'TEST');
    END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
    ALTER COLUMN "role" TYPE "Role"
    USING (
        CASE
            WHEN "role" IN ('USER', 'ADMIN', 'TEST') THEN "role"
            ELSE 'USER'
        END
    )::"Role";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
