import { supabase } from "@/lib/supabaseClient";

export async function updateUserPreferences(prefs: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase
    .from("user_preferences")
    .update(prefs)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to update preferences:", error);
  }
}
