// ============================================================
// FILE: src/components/settings/SettingsSelect.tsx
// ============================================================
// Ripple — Settings dropdown
// Dark surface, coral focus ring, custom chevron.
// Used in Settings page for default video preferences.
// ============================================================

"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface SettingsSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

export default function SettingsSelect({
  label,
  value,
  onChange,
  options,
}: SettingsSelectProps) {
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col"
    >
      <label
        className="text-xs font-semibold mb-1.5 uppercase tracking-wider"
        style={{
          color: "#8B8794",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </label>

      <div className="relative">
        <select
          className="w-full appearance-none rounded-lg px-3 py-2.5 pr-10 text-sm font-medium transition-all outline-none cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            background: "#16151F",
            border: focused
              ? "1px solid rgba(255,107,90,0.5)"
              : "1px solid rgba(255,255,255,0.1)",
            color: "#F5F2ED",
            boxShadow: focused
              ? "0 0 0 3px rgba(255,107,90,0.15)"
              : "none",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
          onMouseEnter={(e) => {
            if (!focused) {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
            }
          }}
          onMouseLeave={(e) => {
            if (!focused) {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            }
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt} style={{ background: "#16151F", color: "#F5F2ED" }}>
              {opt}
            </option>
          ))}
        </select>

        {/* Custom chevron icon */}
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors"
          style={{ color: focused ? "#FF8B7A" : "#5A5762" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}