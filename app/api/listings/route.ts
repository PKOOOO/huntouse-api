import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Prisma } from '@/app/generated/prisma/client';
import { requireUser } from '@/lib/auth';
import { COUNTIES } from '@/lib/kenya';
import { ListingFields, toListingData } from '@/lib/listing-input';
import {
  listerTypesFor,
  listingInclude,
  publicInclude,
  serializeOwnListing,
  serializePublicListing,
} from '@/lib/listings';
import { prisma } from '@/lib/prisma';

const PAGE_SIZE = 20;

const BrowseQuery = z.object({
  county: z.enum(COUNTIES).optional(),
  area: z.string().trim().min(2).max(80).optional(),
  propertyType: z
    .enum(['home', 'apartments', 'condos', 'lofts', 'villas', 'townhouses', 'studios', 'penthouses', 'bedsitters'])
    .optional(),
  furnishing: z.enum(['unfurnished', 'semi_furnished', 'furnished']).optional(),
  minRent: z.coerce.number().int().min(0).optional(),
  maxRent: z.coerce.number().int().min(0).optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  /** Vacant only by default — showing taken houses is the problem Huntouse exists to fix. */
  includeTaken: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
});

/** GET /api/listings — public browse of LIVE listings (newest first, cursor-paginated). */
export async function GET(req: Request) {
  const parsed = BrowseQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const where: Prisma.ListingWhereInput = {
    status: 'LIVE',
    purpose: 'RENT',
    ...(q.includeTaken !== 'true' && { availability: 'VACANT' }),
    ...(q.county && { county: q.county }),
    ...(q.area && { area: { contains: q.area, mode: 'insensitive' } }),
    ...(q.propertyType && { propertyType: q.propertyType.toUpperCase() as Prisma.ListingWhereInput['propertyType'] }),
    ...(q.furnishing && { furnishing: q.furnishing.toUpperCase() as Prisma.ListingWhereInput['furnishing'] }),
    ...((q.minRent !== undefined || q.maxRent !== undefined) && {
      monthlyRentKes: { gte: q.minRent, lte: q.maxRent },
    }),
    ...(q.minBedrooms !== undefined && { bedrooms: { gte: q.minBedrooms } }),
  };
  const rows = await prisma.listing.findMany({
    where,
    include: publicInclude,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({
    listings: page.map(serializePublicListing),
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
  });
}

const CreateBody = z.object({ listerType: z.enum(['owner', 'agent']).optional() }).and(ListingFields);

/** POST /api/listings — start a draft listing. Verified owners / agents only. */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const allowed = listerTypesFor(user);
  if (allowed.length === 0) {
    return NextResponse.json({ error: 'verification_required' }, { status: 403 });
  }
  const parsed = CreateBody.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const { listerType: requested, ...fields } = parsed.data;
  const listerType = requested ? (requested.toUpperCase() as 'OWNER' | 'AGENT') : allowed[0];
  if (!allowed.includes(listerType)) {
    return NextResponse.json({ error: 'verification_required', listerType: requested }, { status: 403 });
  }

  const listing = await prisma.listing.create({
    data: {
      ...toListingData(fields),
      listerId: user.id,
      listerType,
      agencyId: listerType === 'AGENT' ? user.agencyId : null,
    },
    include: listingInclude,
  });
  return NextResponse.json(serializeOwnListing(listing), { status: 201 });
}
