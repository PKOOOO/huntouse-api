import { redirect } from 'next/navigation';

/** The web side of huntouse-api is only the admin dashboard. */
export default function Home() {
  redirect('/admin');
}
