import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 (S3-compatible), two buckets:
 * - `kyc` (private): identity / ownership documents. Clients upload with short-lived presigned
 *   PUT URLs and admins view with presigned GET URLs. Nothing in it is public.
 * - `listings` (public via its R2.dev / custom domain): listing photos. Uploaded the same way;
 *   keys contain a random UUID so photos of unpublished listings can't be guessed.
 */

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local.`);
  return value;
}

export type Bucket = 'kyc' | 'listings';

const BUCKETS: Record<Bucket, string> = {
  kyc: env('R2_BUCKET'),
  listings: env('R2_LISTINGS_BUCKET'),
};

const LISTINGS_PUBLIC_URL = env('R2_LISTINGS_PUBLIC_URL').replace(/\/+$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
  },
});

const UPLOAD_URL_TTL_S = 10 * 60;
const VIEW_URL_TTL_S = 5 * 60;

/**
 * Presigned upload. The content type is part of the signature. The byte length is NOT signed —
 * mobile HTTP clients don't reliably send a matching Content-Length — so size is enforced at
 * submit instead: every object must exist with exactly the declared size.
 */
export function presignUpload(bucket: Bucket, key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKETS[bucket], Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_S, signableHeaders: new Set(['content-type']) },
  );
}

/** Short-lived read URL for a private object. */
export function presignView(bucket: Bucket, key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKETS[bucket], Key: key }), {
    expiresIn: VIEW_URL_TTL_S,
  });
}

/** Permanent public URL of a listing photo. */
export function listingPhotoUrl(key: string) {
  return `${LISTINGS_PUBLIC_URL}/${key}`;
}

/** Size of the stored object, or null if it hasn't been uploaded. */
export async function objectSize(bucket: Bucket, key: string): Promise<number | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKETS[bucket], Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(bucket: Bucket, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS[bucket], Key: key })).catch(() => {});
}
