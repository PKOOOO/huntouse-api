import 'server-only';

import { createHmac } from 'node:crypto';

import type {
  DocumentKind,
  IdDocumentType,
  Prisma,
  Role,
  VerificationKind,
} from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { objectSize, presignView } from '@/lib/r2';
import { syncRolesToClerk } from '@/lib/users';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
/** Ownership proof and licences are often scanned PDFs; identity documents must be photos. */
const ALLOWED_TYPES: Record<DocumentKind, string[]> = {
  ID_FRONT: IMAGE_TYPES,
  ID_BACK: IMAGE_TYPES,
  SELFIE: IMAGE_TYPES,
  OWNERSHIP_PROOF: [...IMAGE_TYPES, 'application/pdf'],
  AGENT_LICENSE: [...IMAGE_TYPES, 'application/pdf'],
};

export function isAllowedType(kind: DocumentKind, contentType: string) {
  return ALLOWED_TYPES[kind].includes(contentType);
}

const ROLE_FOR: Record<VerificationKind, Role> = { OWNER: 'OWNER', AGENT: 'AGENT' };

/** Documents a request needs before it can be submitted. */
export function requiredDocuments(kind: VerificationKind, idType: IdDocumentType | null) {
  const docs: DocumentKind[] = ['ID_FRONT', 'SELFIE'];
  if (idType !== 'PASSPORT') docs.push('ID_BACK');
  docs.push(kind === 'OWNER' ? 'OWNERSHIP_PROOF' : 'AGENT_LICENSE');
  return docs;
}

/** Normalizes an ID number and returns its peppered hash + last 4 characters. */
export function protectIdNumber(raw: string) {
  const normalized = raw.replace(/[\s-]/g, '').toUpperCase();
  const pepper = process.env.ID_HASH_PEPPER;
  if (!pepper) throw new Error('Missing ID_HASH_PEPPER. Add it to .env.local.');
  return {
    idNumberHash: createHmac('sha256', pepper).update(normalized).digest('hex'),
    idNumberLast4: normalized.slice(-4),
  };
}

export type RequestWithDocs = Prisma.VerificationRequestGetPayload<{ include: { documents: true } }>;

/** What's still missing before submit (empty = ready). */
export function missingForSubmit(req: RequestWithDocs) {
  const missing: string[] = [];
  if (!req.idType) missing.push('idType');
  if (!req.idNumberHash) missing.push('idNumber');
  if (req.kind === 'AGENT') {
    if (!req.earbNumber) missing.push('earbNumber');
    if (!req.agencyName) missing.push('agencyName');
  }
  const have = new Set(req.documents.map((d) => d.kind));
  for (const kind of requiredDocuments(req.kind, req.idType)) {
    if (!have.has(kind)) missing.push(`document:${kind}`);
  }
  return missing;
}

/** Confirms every registered document really is in R2 with the declared size. */
export async function documentsUploaded(req: RequestWithDocs) {
  const sizes = await Promise.all(req.documents.map((d) => objectSize(d.storageKey)));
  return req.documents.filter((d, i) => sizes[i] !== d.sizeBytes).map((d) => d.kind);
}

/** Client-facing shape for the applicant. */
export function serializeRequest(req: RequestWithDocs) {
  return {
    id: req.id,
    kind: req.kind.toLowerCase(),
    status: req.status.toLowerCase(),
    idType: req.idType?.toLowerCase() ?? null,
    idNumberLast4: req.idNumberLast4,
    earbNumber: req.earbNumber,
    agencyName: req.agencyName,
    agencyLocation: req.agencyLocation,
    documents: req.documents.map((d) => ({
      kind: d.kind.toLowerCase(),
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
    })),
    requiredDocuments: requiredDocuments(req.kind, req.idType).map((k) => k.toLowerCase()),
    missing: missingForSubmit(req),
    submittedAt: req.submittedAt,
    reviewedAt: req.reviewedAt,
    rejectionReason: req.rejectionReason,
  };
}

/** Other accounts that used the same ID number on a submitted/approved request (fraud signal). */
export async function duplicateIdAccounts(req: RequestWithDocs) {
  if (!req.idNumberHash) return [];
  return prisma.verificationRequest.findMany({
    where: {
      idNumberHash: req.idNumberHash,
      userId: { not: req.userId },
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { id: true, kind: true, status: true, user: { select: { email: true } } },
  });
}

/** Signed, short-lived view URLs for an admin. */
export async function documentViewUrls(req: RequestWithDocs) {
  return Promise.all(
    req.documents.map(async (d) => ({
      kind: d.kind,
      contentType: d.contentType,
      url: await presignView(d.storageKey),
    })),
  );
}

/** Approves a pending request: grants the role (and agency for agents) and syncs Clerk. */
export async function approveRequest(requestId: string, reviewerId: string) {
  const user = await prisma.$transaction(async (tx) => {
    const req = await tx.verificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { user: true },
    });
    if (req.status !== 'PENDING') throw new Error(`Request is ${req.status}, not PENDING`);
    await tx.verificationRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: null },
    });
    const role = ROLE_FOR[req.kind];
    const roles = req.user.roles.includes(role) ? req.user.roles : [...req.user.roles, role];
    const agency =
      req.kind === 'AGENT' && req.agencyName && !req.user.agencyId
        ? await tx.agency.create({
            data: { name: req.agencyName, location: req.agencyLocation, earbNumber: req.earbNumber },
          })
        : null;
    return tx.user.update({
      where: { id: req.userId },
      // Marked stale until the Clerk mirror succeeds; see syncRolesToClerk.
      data: { roles, clerkRolesStale: true, ...(agency && { agencyId: agency.id }) },
    });
  });
  await syncRolesToClerk(user.clerkId, user.roles);
  return user;
}

export async function rejectRequest(requestId: string, reviewerId: string, reason: string) {
  const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== 'PENDING') throw new Error(`Request is ${req.status}, not PENDING`);
  return prisma.verificationRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
  });
}
