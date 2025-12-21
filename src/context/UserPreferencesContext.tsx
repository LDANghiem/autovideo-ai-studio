"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { loadPreferences } from "@/lib/preferences/loadPreferences";

// Full preference type including new AutoVideo fields
export type UserPreferences = {
  name: string;
  email: string;
  dark_mode: boolean;

  default_voice: string;
  default_video_length: string;
  default_style: string;
  default_resolution: string;
  default_language: string;
  default_tone: string;
  default_music: string;
};

// Expanded default prefs including new fields
const defaultPrefs: UserPreferences = {
  name: "",
  email: "",
  dark_mode: false,

  default_voice: "AI Voice",
  default_video_length: "60 seconds",
  default_style: "modern",
  default_resolution: "1080p",
  default_language: "English",
  default_tone: "friendly",
  default_music: "ambient",
};

type PrefsContextType = {
  prefs: UserPreferences;
  loading: boolean;
  refreshPrefs: () => Promise<void>;
  setPrefsLocal: (p: Partial<UserPreferences>) => void; // instant UI update
};

const UserPreferencesContext = createContext<PrefsContextType>({
  prefs: defaultPrefs,
  loading: true,
  refreshPrefs: async () => {},
  setPrefsLocal: () => {},
});

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(defaultPrefs);
  const [loading, setLoading] = useState(true);

  // Load from DB
  const fetchPrefs = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const loaded = await loadPreferences(user.id);

    if (loaded) {
      setPrefs({
        ...defaultPrefs, // fallback for any missing fields
        ...loaded,
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPrefs();
  }, []);

  // Instant sync across app without refresh
  const setPrefsLocal = (partial: Partial<UserPreferences>) => {
    setPrefs((prev) => ({
      ...prev,
      ...partial,
    }));
  };

  return (
    <UserPreferencesContext.Provider
      value={{
        prefs,
        loading,
        refreshPrefs: fetchPrefs,
        setPrefsLocal,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}
