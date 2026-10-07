-- CreateEnum
CREATE TYPE "ListingPurpose" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "ListerType" AS ENUM ('OWNER', 'AGENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('VACANT', 'TAKEN');

-- CreateEnum
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED');

-- CreateEnum
CREATE TYPE "ListingDocumentKind" AS ENUM ('OWNERSHIP_PROOF', 'MANDATE');

-- AlterEnum
ALTER TYPE "PropertyType" ADD VALUE 'BEDSITTERS';

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "listerId" TEXT NOT NULL,
    "listerType" "ListerType" NOT NULL,
    "agencyId" TEXT,
    "purpose" "ListingPurpose" NOT NULL DEFAULT 'RENT',
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "propertyType" "PropertyType",
    "title" TEXT,
    "description" TEXT,
    "county" TEXT,
    "area" TEXT,
    "addressLine" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "sizeSqm" INTEGER,
    "furnishing" "Furnishing",
    "availableFrom" DATE,
    "monthlyRentKes" INTEGER,
    "depositKes" INTEGER,
    "serviceChargeKes" INTEGER,
    "amenities" TEXT[],
    "availability" "Availability" NOT NULL DEFAULT 'VACANT',
    "availabilityUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "inquiryCount" INTEGER NOT NULL DEFAULT 0,
    "viewingRequestCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingDocument" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "ListingDocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_listerId_status_idx" ON "Listing"("listerId", "status");

-- CreateIndex
CREATE INDEX "Listing_status_submittedAt_idx" ON "Listing"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Listing_status_availability_county_idx" ON "Listing"("status", "availability", "county");

-- CreateIndex
CREATE UNIQUE INDEX "ListingPhoto_storageKey_key" ON "ListingPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "ListingPhoto_listingId_position_idx" ON "ListingPhoto"("listingId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ListingDocument_storageKey_key" ON "ListingDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ListingDocument_listingId_kind_key" ON "ListingDocument"("listingId", "kind");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_listerId_fkey" FOREIGN KEY ("listerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDocument" ADD CONSTRAINT "ListingDocument_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
