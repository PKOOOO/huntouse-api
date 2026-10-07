import 'server-only';

import type { Prisma, ViewingSlot } from '@/app/generated/prisma/client';
import { listingPhotoUrl } from '@/lib/r2';

/** How far ahead a renter can book. */
export const MAX_DAYS_AHEAD = 30;
/** Anti-spam: new requests one renter may send per 24 hours. */
export const MAX_REQUESTS_PER_DAY = 5;

export const SLOTS: Record<'morning' | 'afternoon' | 'evening', ViewingSlot> = {
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  evening: 'EVENING',
};

/** Today's date in Kenya (UTC+3, no DST) as YYYY-MM-DD. */
export function todayInKenya(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const viewingInclude = {
  listing: {
    select: {
      id: true,
      title: true,
      area: true,
      county: true,
      monthlyRentKes: true,
      addressLine: true,
      latitude: true,
      longitude: true,
      status: true,
      availability: true,
      photos: { orderBy: { position: 'asc' }, take: 1, select: { storageKey: true } },
    },
  },
  seeker: { select: { firstName: true, imageUrl: true } },
  host: { select: { firstName: true, imageUrl: true } },
} satisfies Prisma.ViewingRequestInclude;

type ViewingFull = Prisma.ViewingRequestGetPayload<{ include: typeof viewingInclude }>;

/** REQUESTED but the day has passed → shown as expired (nobody answered in time). */
function effectiveStatus(v: ViewingFull) {
  const date = v.date.toISOString().slice(0, 10);
  if (v.status === 'REQUESTED' && date < todayInKenya()) return 'expired';
  return v.status.toLowerCase();
}

function serializeShared(v: ViewingFull) {
  const cover = v.listing.photos[0];
  return {
    id: v.id,
    status: effectiveStatus(v),
    date: v.date.toISOString().slice(0, 10),
    slot: v.slot.toLowerCase(),
    message: v.message,
    hostNote: v.hostNote,
    createdAt: v.createdAt,
    respondedAt: v.respondedAt,
    listing: {
      id: v.listing.id,
      title: v.listing.title,
      area: v.listing.area,
      county: v.listing.county,
      monthlyRentKes: v.listing.monthlyRentKes,
      coverUrl: cover ? listingPhotoUrl(cover.storageKey) : null,
    },
  };
}

/**
 * The renter's view. The exact address and pin are only revealed once the host has accepted —
 * before that, the renter knows the area only.
 */
export function serializeForSeeker(v: ViewingFull) {
  const accepted = v.status === 'ACCEPTED';
  return {
    ...serializeShared(v),
    host: { firstName: v.host.firstName, imageUrl: v.host.imageUrl },
    address: accepted
      ? { addressLine: v.listing.addressLine, latitude: v.listing.latitude, longitude: v.listing.longitude }
      : null,
  };
}

/** The host's view: who wants to come and when. */
export function serializeForHost(v: ViewingFull) {
  return {
    ...serializeShared(v),
    seeker: { firstName: v.seeker.firstName, imageUrl: v.seeker.imageUrl },
  };
}
