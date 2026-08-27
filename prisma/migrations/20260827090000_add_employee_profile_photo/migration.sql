ALTER TABLE "Employee"
ADD COLUMN "profilePhotoData" BYTEA,
ADD COLUMN "profilePhotoMimeType" TEXT,
ADD COLUMN "profilePhotoUpdatedAt" TIMESTAMP(3);
