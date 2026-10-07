import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-3 w-3 rounded-full bg-[#EC6846]" />
          Huntouse Admin
        </Link>
        <UserButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">{children}</main>
    </div>
  );
}
