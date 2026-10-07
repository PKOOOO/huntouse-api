import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';
import { fieldsFromWebhook, markUserDeleted, upsertUser } from '@/lib/users';

/**
 * Clerk → database sync. Signature verified with CLERK_WEBHOOK_SIGNING_SECRET.
 * Return 2xx when handled (or deliberately ignored); any other status makes Svix retry.
 */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error('[webhook] verification failed:', err);
    return new Response('Verification failed', { status: 400 });
  }

  // Svix retries deliver the same message id; process each one once.
  const messageId = req.headers.get('svix-id');
  if (messageId) {
    const seen = await prisma.processedWebhook.findUnique({ where: { id: messageId } });
    if (seen) return new Response('Already processed', { status: 200 });
  }

  switch (evt.type) {
    case 'user.created':
    case 'user.updated':
      await upsertUser(fieldsFromWebhook(evt.data));
      break;
    case 'user.deleted':
      if (evt.data.id) await markUserDeleted(evt.data.id);
      break;
    default:
      // Not subscribed to anything else yet; acknowledge so Svix doesn't retry.
      break;
  }

  if (messageId) {
    await prisma.processedWebhook
      .create({ data: { id: messageId, type: evt.type } })
      .catch(() => {
        // A concurrent retry already recorded it; the handlers above are idempotent anyway.
      });
  }

  return new Response('OK', { status: 200 });
}
