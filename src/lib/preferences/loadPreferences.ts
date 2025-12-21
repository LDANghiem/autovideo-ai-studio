import { supabase } from "../supabaseClient";

export async function loadPreferences(userId: string) {
  
  const { data, error } = await supabase
  .from("user_preferences")
  .select(`
    name,
    email,
    dark_mode,
    default_voice,
    default_video_length,
    default_style,
    default_resolution,
    default_language,
    default_tone,
    default_music
  `)
  .eq("user_id", userId)
  .maybeSingle();
  

  if (error && error.code !== "PGRST116") {
    console.error("Load Prefs Error:", error);
    return null;
  }

  return data;
}
