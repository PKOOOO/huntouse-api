import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import type { Role } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/** Clerk's user payload as delivered by `user.created` / `user.updated` webhooks. */
type UserJSON = Extract<WebhookEvent, { type: 'user.created' | 'user.updated' }>['data'];

/** The subset of a Clerk user we mirror, normalized from either webhook JSON or the Backend API. */
type ClerkUserFields = {
  clerkId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
};

export function fieldsFromWebhook(data: UserJSON): ClerkUserFields {
  const primary =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses[0];
  return {
    clerkId: data.id,
    email: primary?.email_address ?? null,
    firstName: data.first_name,
    lastName: data.last_name,
    imageUrl: data.image_url || null,
  };
}

async function fieldsFromClerkApi(clerkId: string): Promise<ClerkUserFields> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkId);
  return {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl || null,
  };
}

const SYNC_ATTEMPTS = 3;

/**
 * Mirrors the user's roles into Clerk `publicMetadata` (server-writable only), so the app can
 * read them from the session token without calling the API. The database stays the source of
 * truth: this never throws. On failure the user is left marked `clerkRolesStale` and the sync is
 * retried on their next API call (see `ensureUser`). Returns whether Clerk is now up to date.
 */
export async function syncRolesToClerk(clerkId: string, roles: Role[]) {
  const client = await clerkClient();
  for (let attempt = 1; attempt <= SYNC_ATTEMPTS; attempt++) {
    try {
      await client.users.updateUserMetadata(clerkId, {
        publicMetadata: { roles: roles.map((r) => r.toLowerCase()) },
      });
      await prisma.user.updateMany({ where: { clerkId }, data: { clerkRolesStale: false } });
      return true;
    } catch (error) {
      if (attempt === SYNC_ATTEMPTS) {
        console.warn(`[roles] Clerk sync failed for ${clerkId}; will retry on next request`, error);
        await prisma.user
          .updateMany({ where: { clerkId }, data: { clerkRolesStale: true } })
          .catch(() => {});
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return false;
}

/**
 * Creates the user (as SEEKER) or refreshes their Clerk-owned fields. Never touches roles of an
 * existing user. Returns the user and whether it was newly created.
 */
export async function upsertUser(fields: ClerkUserFields) {
  const existing = await prisma.user.findUnique({ where: { clerkId: fields.clerkId } });
  const { clerkId, ...profile } = fields;
  if (existing) {
    const user = await prisma.user.update({ where: { clerkId }, data: profile });
    return { user, created: false };
  }
  let user;
  try {
    user = await prisma.user.create({ data: fields });
  } catch (error) {
    // The webhook and a first API call can race to create the same user; the loser just reads.
    const raced = await prisma.user.findUnique({ where: { clerkId } });
    if (raced) return { user: raced, created: false };
    throw error;
  }
  await syncRolesToClerk(clerkId, user.roles);
  return { user, created: true };
}

/**
 * The DB user for a signed-in Clerk user, creating it on first sight. Webhooks are eventually
 * consistent, so API calls must not assume the `user.created` event has arrived yet.
 */
export async function ensureUser(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });
  if (user) {
    if (user.clerkRolesStale) await syncRolesToClerk(clerkId, user.roles);
    return user;
  }
  await upsertUser(await fieldsFromClerkApi(clerkId));
  return prisma.user.findUniqueOrThrow({ where: { clerkId }, include: { profile: true } });
}

export async function markUserDeleted(clerkId: string) {
  await prisma.user.updateMany({
    where: { clerkId },
    data: { status: 'DELETED', deletedAt: new Date() },
  });
}
