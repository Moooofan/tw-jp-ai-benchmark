import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Read-only server client. Never writes cookies (server components can't). */
export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Session refresh happens in middleware.
        },
      },
    },
  );
}
