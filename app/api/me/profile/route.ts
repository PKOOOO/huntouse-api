import { NextResponse } from 'next/server';
import { z } from 'zod';

import { Goal, PropertyType } from '@/app/generated/prisma/client';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeMe } from '@/lib/serialize';

/** Accepts the app's lower-case values and maps them to the DB enums. */
const enumFromLower = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(Object.values(values) as [T[keyof T], ...T[keyof T][]]));

const ISO_COUNTRY = z.string().regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code');

const ProfileBody = z.object({
  countryCode: ISO_COUNTRY.nullish(),
  phoneCountryCode: ISO_COUNTRY.nullish(),
  phone: z
    .string()
    .regex(/^\d{4,15}$/, 'Digits only, without the country code')
    .nullish(),
  /** YYYY-MM-DD */
  birthday: z.iso.date().nullish(),
  goals: z.array(enumFromLower(Goal)).max(4).default([]),
  propertyTypes: z.array(enumFromLower(PropertyType)).max(8).default([]),
  /** Marks the profile-setup wizard as finished. */
  completeSetup: z.boolean().default(false),
});

/** PUT /api/me/profile — saves the profile-setup answers for the signed-in user. */
export async function PUT(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const { completeSetup, birthday, ...rest } = parsed.data;
  const data = {
    ...rest,
    goals: [...new Set(rest.goals)],
    propertyTypes: [...new Set(rest.propertyTypes)],
    birthday: birthday ? new Date(`${birthday}T00:00:00Z`) : null,
    ...(completeSetup && { setupCompletedAt: new Date() }),
  };

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { profile: true },
  });
  return NextResponse.json(serializeMe(updated));
}
