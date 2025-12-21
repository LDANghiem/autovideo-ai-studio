"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { loadPreferences } from "./loadPreferences";

export function useUserPreferences() {
  const [prefs, setPrefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrefs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const data = await loadPreferences(user.id);
      setPrefs(data);
      setLoading(false);
    }
    fetchPrefs();
  }, []);

  return { prefs, loading };
}
