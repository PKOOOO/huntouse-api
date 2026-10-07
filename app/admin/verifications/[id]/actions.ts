'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/admin';
import { approveRequest, rejectRequest } from '@/lib/verification';

// Server actions are public endpoints: each one re-checks the admin role.

export async function approve(requestId: string) {
  const admin = await requireAdmin();
  await approveRequest(requestId, admin.id);
  revalidatePath('/admin');
  redirect('/admin');
}

export async function reject(requestId: string, formData: FormData) {
  const admin = await requireAdmin();
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 5) {
    redirect(`/admin/verifications/${requestId}?error=reason`);
  }
  await rejectRequest(requestId, admin.id, reason.slice(0, 500));
  revalidatePath('/admin');
  redirect('/admin');
}
