import 'server-only';

import { NextResponse } from 'next/server';

import type { ListingDocumentKind, ListingStatus, Prisma } from '@/app/generated/prisma/client';
import type { ApiUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteObject, listingPhotoUrl, objectSize, presignView } from '@/lib/r2';

export const MIN_PHOTOS = 5;
export const MAX_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Photos are shown on the web too, so no HEIC: the app converts to JPEG before uploading. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** Amenity keys the app can offer. Labels live in the app. */
export const AMENITIES = [
  'parking',
  'water_backup',
  'backup_power',
  'security_guard',
  'cctv',
  'electric_fence',
  'wifi',
  'lift',
  'gym',
  'swimming_pool',
  'balcony',
  'garden',
  'servant_quarter',
  'pet_friendly',
] as const;

/**
 * Fields a lister may change while the listing is LIVE without a new review. They keep a listing
 * fresh (price, dates, extras) but can't turn it into a different property; title, location,
 * type, rooms and photos are reviewed, so changing those needs a new submission.
 */
export const LIVE_EDITABLE_FIELDS = [
  'description',
  'monthlyRentKes',
  'depositKes',
  'serviceChargeKes',
  'furnishing',
  'availableFrom',
  'amenities',
] as const;

const EDITABLE: ListingStatus[] = ['DRAFT', 'REJECTED'];

export const listingInclude = {
  photos: { orderBy: { position: 'asc' } },
  documents: true,
} satisfies Prisma.ListingInclude;

export type ListingFull = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

/** The roles that let a user list, as lister types. */
export function listerTypesFor(user: ApiUser) {
  return (['OWNER', 'AGENT'] as const).filter((r) => user.roles.includes(r));
}

export function isEditable(status: ListingStatus) {
  return EDITABLE.includes(status);
}

/**
 * Loads one of the signed-in user's own listings. `editable` additionally requires DRAFT or
 * REJECTED (a rejected listing can be fixed and resubmitted).
 */
export async function loadOwnListing(user: ApiUser, id: string, { editable = false } = {}) {
  const listing = await prisma.listing.findFirst({
    where: { id, listerId: user.id },
    include: listingInclude,
  });
  if (!listing) {
    return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  if (editable && !isEditable(listing.status)) {
    return {
      response: NextResponse.json(
        { error: 'not_editable', status: listing.status.toLowerCase() },
        { status: 409 },
      ),
    } as const;
  }
  return { listing } as const;
}

/** Documents a listing needs before it can be submitted. */
export function requiredDocuments(listing: Pick<ListingFull, 'listerType' | 'purpose'>) {
  const docs: ListingDocumentKind[] = [];
  if (listing.listerType === 'OWNER') docs.push('OWNERSHIP_PROOF');
  if (listing.listerType === 'AGENT' && listing.purpose === 'SALE') docs.push('MANDATE');
  return docs;
}

/** What's still missing before submit (empty = ready). */
export function missingForSubmit(listing: ListingFull) {
  const missing: string[] = [];
  const required = [
    'propertyType',
    'title',
    'description',
    'county',
    'area',
    'latitude',
    'longitude',
    'bedrooms',
    'bathrooms',
    'furnishing',
    'monthlyRentKes',
    'depositKes',
  ] as const;
  for (const field of required) {
    if (listing[field] === null) missing.push(field);
  }
  if (listing.photos.length < MIN_PHOTOS) missing.push('photos');
  const have = new Set(listing.documents.map((d) => d.kind));
  for (const kind of requiredDocuments(listing)) {
    if (!have.has(kind)) missing.push(`document:${kind.toLowerCase()}`);
  }
  return missing;
}

/** Confirms every photo / document really is in R2 with the declared size. */
export async function filesNotUploaded(listing: ListingFull) {
  const [photoSizes, docSizes] = await Promise.all([
    Promise.all(listing.photos.map((p) => objectSize('listings', p.storageKey))),
    Promise.all(listing.documents.map((d) => objectSize('kyc', d.storageKey))),
  ]);
  return {
    photos: listing.photos.filter((p, i) => photoSizes[i] !== p.sizeBytes).map((p) => p.id),
    documents: listing.documents
      .filter((d, i) => docSizes[i] !== d.sizeBytes)
      .map((d) => d.kind.toLowerCase()),
  };
}

/** Deletes a listing's files from R2 (used when a draft is deleted). */
export async function deleteListingFiles(listing: ListingFull) {
  await Promise.all([
    ...listing.photos.map((p) => deleteObject('listings', p.storageKey)),
    ...listing.documents.map((d) => deleteObject('kyc', d.storageKey)),
  ]);
}

const lower = <T extends string>(v: T | null) => (v ? v.toLowerCase() : null);
const isoDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

function serializePhotos(listing: ListingFull) {
  return listing.photos.map((p) => ({ id: p.id, url: listingPhotoUrl(p.storageKey) }));
}

/** Fields both the lister and seekers see. Never includes the exact address or coordinates. */
function serializeShared(listing: ListingFull) {
  return {
    id: listing.id,
    purpose: listing.purpose.toLowerCase(),
    listerType: listing.listerType.toLowerCase(),
    propertyType: lower(listing.propertyType),
    title: listing.title,
    description: listing.description,
    county: listing.county,
    area: listing.area,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sizeSqm: listing.sizeSqm,
    furnishing: lower(listing.furnishing),
    availableFrom: isoDate(listing.availableFrom),
    monthlyRentKes: listing.monthlyRentKes,
    depositKes: listing.depositKes,
    serviceChargeKes: listing.serviceChargeKes,
    amenities: listing.amenities,
    availability: listing.availability.toLowerCase(),
    availabilityUpdatedAt: listing.availabilityUpdatedAt,
    photos: serializePhotos(listing),
    publishedAt: listing.publishedAt,
  };
}

/** The lister's own view: everything, including private location, review state and stats. */
export function serializeOwnListing(listing: ListingFull) {
  return {
    ...serializeShared(listing),
    status: listing.status.toLowerCase(),
    addressLine: listing.addressLine,
    latitude: listing.latitude,
    longitude: listing.longitude,
    documents: listing.documents.map((d) => ({
      kind: d.kind.toLowerCase(),
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
    })),
    requiredDocuments: requiredDocuments(listing).map((k) => k.toLowerCase()),
    missing: missingForSubmit(listing),
    stats: {
      views: listing.viewCount,
      saves: listing.saveCount,
      inquiries: listing.inquiryCount,
      viewingRequests: listing.viewingRequestCount,
    },
    submittedAt: listing.submittedAt,
    reviewedAt: listing.reviewedAt,
    rejectionReason: listing.rejectionReason,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

type PublicLister = {
  lister: { firstName: string | null; imageUrl: string | null };
  agency: { name: string } | null;
};

/** What seekers see: area only (no exact location), plus who is listing it. */
export function serializePublicListing(listing: ListingFull & PublicLister) {
  return {
    ...serializeShared(listing),
    lister: {
      firstName: listing.lister.firstName,
      imageUrl: listing.lister.imageUrl,
      // Only verified owners / agents can create listings, and every listing is reviewed.
      verified: true,
      agencyName: listing.agency?.name ?? null,
    },
  };
}

export const publicInclude = {
  ...listingInclude,
  lister: { select: { firstName: true, imageUrl: true } },
  agency: { select: { name: true } },
} satisfies Prisma.ListingInclude;

/** Signed, short-lived document URLs for an admin. */
export async function listingDocumentViewUrls(listing: ListingFull) {
  return Promise.all(
    listing.documents.map(async (d) => ({
      kind: d.kind,
      contentType: d.contentType,
      url: await presignView('kyc', d.storageKey),
    })),
  );
}

export async function approveListing(listingId: string, reviewerId: string) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { lister: true },
  });
  if (listing.status !== 'PENDING_REVIEW') {
    throw new Error(`Listing is ${listing.status}, not PENDING_REVIEW`);
  }
  if (listing.lister.status !== 'ACTIVE' || !listing.lister.roles.includes(listing.listerType)) {
    throw new Error('Lister is no longer an active verified host');
  }
  const now = new Date();
  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: 'LIVE',
      reviewedAt: now,
      reviewedById: reviewerId,
      rejectionReason: null,
      publishedAt: listing.publishedAt ?? now,
    },
  });
}

export async function rejectListing(listingId: string, reviewerId: string, reason: string) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (listing.status !== 'PENDING_REVIEW') {
    throw new Error(`Listing is ${listing.status}, not PENDING_REVIEW`);
  }
  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      rejectionReason: reason,
    },
  });
}

/** Admin take-down of a live listing (e.g. reported as fraud). */
export async function takeDownListing(listingId: string, reviewerId: string, reason: string) {
  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      rejectionReason: reason,
    },
  });
}
