/**
 * Grants (or revokes) the ADMIN role. This is the ONLY way anyone becomes an admin.
 *
 *   pnpm admin:grant someone@example.com
 *   pnpm admin:grant someone@example.com --revoke
 *
 * The user must have signed in to the app at least once (so they exist in the database).
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const { PrismaPg } = await import('@prisma/adapter-pg');
const { PrismaClient } = await import('../app/generated/prisma/client');

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('Usage: pnpm admin:grant <email> [--revoke]');
  process.exit(1);
}
const revoke = flag === '--revoke';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const matches = await prisma.user.findMany({ where: { email, status: 'ACTIVE' } });
  if (matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `No active user with email ${email}. Have they signed in to the app yet?`
        : `${matches.length} active users share ${email}; resolve that first.`,
    );
    process.exit(1);
  }
  const [user] = matches;
  const roles = revoke
    ? user.roles.filter((r) => r !== 'ADMIN')
    : [...new Set([...user.roles, 'ADMIN' as const])];
  await prisma.user.update({ where: { id: user.id }, data: { roles, clerkRolesStale: true } });

  // Mirror into Clerk publicMetadata, like lib/users.ts syncRolesToClerk.
  const res = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}/metadata`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ public_metadata: { roles: roles.map((r) => r.toLowerCase()) } }),
  });
  if (!res.ok) throw new Error(`Clerk metadata update failed: HTTP ${res.status} (retried on next request)`);
  await prisma.user.update({ where: { id: user.id }, data: { clerkRolesStale: false } });

  console.log(`${revoke ? 'Revoked' : 'Granted'} ADMIN for ${email}. Roles now: ${roles.join(', ')}`);
} finally {
  await prisma.$disconnect();
}
