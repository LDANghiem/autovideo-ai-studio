"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useUserPreferences } from "./UserPreferencesContext";

type Theme = "light" | "dark";

const ThemeContext = createContext({
  theme: "light" as Theme,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { prefs, loading } = useUserPreferences();
  const [theme, setTheme] = useState<Theme>("light");

  // ⚡ Auto-load saved theme from Supabase once preferences are available
  useEffect(() => {
    if (!loading) {
      const userPrefTheme = prefs.dark_mode ? "dark" : "light";
      setTheme(userPrefTheme);

      if (userPrefTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [loading, prefs.dark_mode]);

  // ⚡ Manual toggle (user clicking the button)
  function toggleTheme() {
    const updated = theme === "light" ? "dark" : "light";
    setTheme(updated);

    if (updated === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
