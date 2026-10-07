import 'server-only';

import { z } from 'zod';

import { COUNTIES, inKenya } from '@/lib/kenya';
import { AMENITIES } from '@/lib/listings';

const PROPERTY_TYPES = {
  home: 'HOME',
  apartments: 'APARTMENTS',
  condos: 'CONDOS',
  lofts: 'LOFTS',
  villas: 'VILLAS',
  townhouses: 'TOWNHOUSES',
  studios: 'STUDIOS',
  penthouses: 'PENTHOUSES',
  bedsitters: 'BEDSITTERS',
} as const;

const FURNISHING = {
  unfurnished: 'UNFURNISHED',
  semi_furnished: 'SEMI_FURNISHED',
  furnished: 'FURNISHED',
} as const;

const kes = z.number().int().min(0).max(100_000_000);

/** Listing fields as the app sends them (lower-case enums). Every field is optional. */
export const ListingFields = z
  .object({
    propertyType: z.enum(Object.keys(PROPERTY_TYPES) as [keyof typeof PROPERTY_TYPES]),
    title: z.string().trim().min(5).max(80),
    description: z.string().trim().min(30).max(2000),
    county: z.enum(COUNTIES),
    area: z.string().trim().min(2).max(80),
    addressLine: z.string().trim().max(160).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    bedrooms: z.number().int().min(0).max(20),
    bathrooms: z.number().int().min(1).max(20),
    sizeSqm: z.number().int().min(5).max(100_000).nullable(),
    furnishing: z.enum(Object.keys(FURNISHING) as [keyof typeof FURNISHING]),
    availableFrom: z.iso.date().nullable(),
    monthlyRentKes: kes.min(500),
    depositKes: kes,
    serviceChargeKes: kes.nullable(),
    amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).transform((a) => [...new Set(a)]),
  })
  .partial()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'Send latitude and longitude together',
    path: ['latitude'],
  })
  .refine((v) => v.latitude === undefined || inKenya(v.latitude, v.longitude!), {
    message: 'The map pin must be in Kenya',
    path: ['latitude'],
  });

export type ListingFieldsInput = z.infer<typeof ListingFields>;

/** Converts validated app input to Prisma data. */
export function toListingData(input: ListingFieldsInput) {
  const { propertyType, furnishing, availableFrom, ...rest } = input;
  return {
    ...rest,
    ...(propertyType && { propertyType: PROPERTY_TYPES[propertyType] }),
    ...(furnishing && { furnishing: FURNISHING[furnishing] }),
    ...(availableFrom !== undefined && {
      availableFrom: availableFrom === null ? null : new Date(availableFrom),
    }),
  };
}
