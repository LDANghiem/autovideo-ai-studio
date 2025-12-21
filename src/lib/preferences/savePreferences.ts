import { supabase } from "../supabaseClient";

export async function savePreferences(
  userId: string,
  prefs: {
    name: string;
    email: string;
    dark_mode: boolean;
    default_voice: string;
    default_video_length: string;

    default_style?: string;
    default_resolution?: string;
    default_language?: string;
    default_tone?: string;
    default_music?: string;
  }
) {
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        ...prefs,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Error saving preferences:", error);
    throw error;
  }

  return data;
}
