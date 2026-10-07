import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeForHost, todayInKenya, viewingInclude } from '@/lib/viewings';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  action: z.enum(['accept', 'decline']),
  /** Directions / meeting point when accepting, or a reason when declining. */
  note: z.string().trim().max(500).optional(),
});

/** POST /api/viewings/:id/respond — the host accepts or declines a viewing request. */
export async function POST(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const viewing = await prisma.viewingRequest.findFirst({ where: { id, hostId: user.id } });
  if (!viewing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (viewing.status !== 'REQUESTED') {
    return NextResponse.json({ error: 'already_answered', status: viewing.status.toLowerCase() }, { status: 409 });
  }
  if (viewing.date.toISOString().slice(0, 10) < todayInKenya()) {
    return NextResponse.json({ error: 'expired' }, { status: 409 });
  }

  const updated = await prisma.viewingRequest.update({
    where: { id },
    data: {
      status: parsed.data.action === 'accept' ? 'ACCEPTED' : 'DECLINED',
      hostNote: parsed.data.note || null,
      respondedAt: new Date(),
    },
    include: viewingInclude,
  });
  return NextResponse.json(serializeForHost(updated));
}
