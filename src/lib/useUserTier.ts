// src/lib/useUserTier.ts
// ------------------------------------------------------------
// Hook: Returns the current user's subscription tier (free/pro)
// Used for gating premium features like Thumbnail Creator
// ------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserTier = "free" | "pro" | "loading";

export function useUserTier(): UserTier {
  const [tier, setTier] = useState<UserTier>("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (!cancelled) setTier("free");
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("tier")
          .eq("id", session.user.id)
          .single();

        if (!cancelled) {
          if (error || !data) {
            // Profile might not exist yet — treat as free
            setTier("free");
          } else {
            setTier(data.tier === "pro" ? "pro" : "free");
          }
        }
      } catch {
        if (!cancelled) setTier("free");
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return tier;
}