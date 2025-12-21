"use client";

import React, { createContext, useContext, useState } from "react";

export interface ToastProps {
  title?: string;
  description?: string;
}

interface ToastContextType {
  toast: (props: ToastProps) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const toast = (props: ToastProps) => {
    setToasts((prev) => [...prev, props]);

    setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-3">
        {toasts.map((t, i) => (
          <div
            key={i}
            className="bg-black text-white px-4 py-3 rounded-lg shadow-lg min-w-[250px] animate-fade-in"
          >
            {t.title && (
              <div className="font-semibold text-base">{t.title}</div>
            )}
            {t.description && (
              <div className="text-sm opacity-90">{t.description}</div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
