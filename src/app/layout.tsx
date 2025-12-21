import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserPreferencesProvider } from "@/context/UserPreferencesContext";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
       <Toaster> 
        <ThemeProvider>
          <UserPreferencesProvider>
            {children}
          </UserPreferencesProvider>
        </ThemeProvider>
       </Toaster>
      </body>
    </html>
  );
}
