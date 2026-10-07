'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/admin';
import { approveListing, rejectListing, takeDownListing } from '@/lib/listings';

// Server actions are public endpoints: each one re-checks the admin role.

function reasonFrom(formData: FormData) {
  return String(formData.get('reason') ?? '').trim().slice(0, 500);
}

export async function approve(listingId: string) {
  const admin = await requireAdmin();
  await approveListing(listingId, admin.id);
  revalidatePath('/admin/listings');
  redirect('/admin/listings');
}

export async function reject(listingId: string, formData: FormData) {
  const admin = await requireAdmin();
  const reason = reasonFrom(formData);
  if (reason.length < 5) redirect(`/admin/listings/${listingId}?error=reason`);
  await rejectListing(listingId, admin.id, reason);
  revalidatePath('/admin/listings');
  redirect('/admin/listings');
}

export async function takeDown(listingId: string, formData: FormData) {
  const admin = await requireAdmin();
  const reason = reasonFrom(formData);
  if (reason.length < 5) redirect(`/admin/listings/${listingId}?error=reason`);
  await takeDownListing(listingId, admin.id, reason);
  revalidatePath('/admin/listings');
  redirect('/admin/listings?status=archived');
}
