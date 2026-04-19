"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signupAction(
  formData: FormData
): Promise<{ error?: string; message?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // If email confirmation is disabled in the Supabase project, a session is
  // issued immediately and we can go straight to the app.
  if (data.session) {
    redirect("/");
  }

  return {
    message:
      "Account created. Check your inbox for a confirmation email before signing in."
  };
}
