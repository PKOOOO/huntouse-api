import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <SignIn forceRedirectUrl="/admin" />
    </main>
  );
}
