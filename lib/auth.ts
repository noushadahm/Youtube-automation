import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Returns the currently authenticated Supabase user, or null.
 * `cache` memoises within a single render / request.
 */
export const getCurrentUser = cache(async () => {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/**
 * Ensures a matching row exists in `storyflow.sf_users` for the Supabase auth
 * user, using the auth.users `id` as the PK. Returns the Prisma user row.
 */
export const getOrCreateProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();

  const profile = await db.user.upsert({
    where: { id: user.id },
    update: { email: user.email ?? "" },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@no-email.local`
    }
  });

  return profile;
});

/**
 * Route-handler guard. Throws UnauthorizedError if not signed in.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return getOrCreateProfile();
}
