"use client";

import { motion } from "framer-motion";

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col"
    >
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>

      <select
        className="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </motion.div>
  );
}
