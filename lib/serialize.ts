import type { ApiUser } from '@/lib/auth';

/** Lower-cased, client-facing shape of the signed-in user. */
export function serializeMe(user: ApiUser) {
  const { profile } = user;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    roles: user.roles.map((r) => r.toLowerCase()),
    status: user.status.toLowerCase(),
    profile: profile
      ? {
          countryCode: profile.countryCode,
          phoneCountryCode: profile.phoneCountryCode,
          phone: profile.phone,
          birthday: profile.birthday?.toISOString().slice(0, 10) ?? null,
          goals: profile.goals.map((g) => g.toLowerCase()),
          propertyTypes: profile.propertyTypes.map((t) => t.toLowerCase()),
          setupCompleted: profile.setupCompletedAt !== null,
        }
      : null,
  };
}
