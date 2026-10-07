import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Next.js 16 renamed middleware.ts to proxy.ts.
// - /admin pages: must be signed in (redirects to /sign-in); the admin ROLE is checked in the
//   pages and server actions themselves (lib/admin.ts), because roles live in our database.
// - /api routes: each route decides whether a signed-in user is required (lib/auth.ts), so
//   unauthenticated API calls get a JSON 401 rather than a redirect. The webhook route verifies
//   its own Svix signature and never needs a session.
const isAdminPage = createRouteMatcher(['/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminPage(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
