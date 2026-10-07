import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeRequest } from '@/lib/verification';

/** GET /api/verifications — the signed-in user's verification requests (newest first). */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const requests = await prisma.verificationRequest.findMany({
    where: { userId: user.id },
    include: { documents: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    roles: user.roles.map((r) => r.toLowerCase()),
    requests: requests.map(serializeRequest),
  });
}

const CreateBody = z.object({ kind: z.enum(['owner', 'agent']) });

/**
 * POST /api/verifications — start becoming an owner or agent. Returns the existing open request
 * for that kind if there is one, so the app can resume where the user left off.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const kind = parsed.data.kind === 'owner' ? 'OWNER' : 'AGENT';

  if (user.roles.includes(kind)) {
    return NextResponse.json({ error: 'already_verified' }, { status: 409 });
  }
  const open = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, kind, status: { in: ['DRAFT', 'PENDING', 'REJECTED'] } },
    include: { documents: true },
    orderBy: { createdAt: 'desc' },
  });
  if (open) return NextResponse.json(serializeRequest(open));

  const created = await prisma.verificationRequest.create({
    data: { userId: user.id, kind },
    include: { documents: true },
  });
  return NextResponse.json(serializeRequest(created), { status: 201 });
}
