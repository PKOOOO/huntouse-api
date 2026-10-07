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
 * Cloudflare R2 (S3-compatible) — private bucket for KYC documents. Nothing in it is public:
 * clients upload with short-lived presigned PUT URLs and admins view with presigned GET URLs.
 */

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local.`);
  return value;
}

const bucket = env('R2_BUCKET');

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
 * submit instead: every object must exist with exactly the declared size (≤ 10 MB).
 */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL_S,
    signableHeaders: new Set(['content-type']),
  });
}

export function presignView(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: VIEW_URL_TTL_S,
  });
}

/** Size of the stored object, or null if it hasn't been uploaded. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
}
