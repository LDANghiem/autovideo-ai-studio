// src/app/dashboard/layout.tsx
// ------------------------------------------------------------
// Dashboard layout — dark purple theme
// APPROACH:
//   - Page background: dark purple (#2d2640)
//   - .bg-white cards: KEEP white bg, ALWAYS dark text
//   - Hover: purple glow border
//   - Selected: thicker purple border + glow
//   - Dark pills/badges (bg-gray-800, bg-black): white text
//   - All other text: light on dark
// ------------------------------------------------------------

"use client";

import { ReactNode } from "react";
import Sidebar from "@/app/dashboard/Sidebar";
import { ToastProvider } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <style>{`
        /* ====== LAYER 1: Global defaults — light text on dark ====== */
        .ds {
          color: #e2e0ea;
        }
        .ds h1, .ds h2, .ds h3, .ds h4 {
          color: #f0ecf8 !important;
        }
        .ds label {
          color: #c8c2d8 !important;
        }

        /* ====== LAYER 2: Form elements ====== */
        .ds input, .ds textarea, .ds select {
          background-color: #1e1a2e !important;
          color: #e2e0ea !important;
          border-color: #4a4260 !important;
          transition: border-color 0.2s ease !important;
        }
        .ds input::placeholder, .ds textarea::placeholder {
          color: #7a7490 !important;
        }
        .ds input:focus, .ds textarea:focus, .ds select:focus {
          border-color: #7c6aef !important;
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(124, 106, 239, 0.2) !important;
        }

        /* ====== LAYER 3: .bg-white — KEEP white, DARK text always ====== */
        .ds .bg-white {
          background-color: #ffffff !important;
          color: #1a1528 !important;
          border-color: #d0cce0 !important;
          transition: all 0.2s ease !important;
        }
        .ds .bg-white * {
          color: #1a1528 !important;
        }
        /* Inputs INSIDE white cards — dark bg + light text so you can see typing */
        .ds .bg-white input,
        .ds .bg-white textarea,
        .ds .bg-white select {
          background-color: #f5f3f9 !important;
          color: #1a1528 !important;
          border-color: #d0cce0 !important;
        }
        .ds .bg-white input::placeholder,
        .ds .bg-white textarea::placeholder {
          color: #8a84a0 !important;
        }
        .ds .bg-white input:focus,
        .ds .bg-white textarea:focus,
        .ds .bg-white select:focus {
          border-color: #7c6aef !important;
          box-shadow: 0 0 0 2px rgba(124, 106, 239, 0.15) !important;
        }
        /* Colored buttons/badges INSIDE white cards — white text on colored bg */
        .ds .bg-white button[class*="bg-red"],
        .ds .bg-white button[class*="bg-blue"],
        .ds .bg-white button[class*="bg-green"],
        .ds .bg-white button[class*="bg-purple"],
        .ds .bg-white button[class*="bg-pink"],
        .ds .bg-white button[class*="bg-yellow"],
        .ds .bg-white button[class*="bg-orange"],
        .ds .bg-white button[class*="bg-emerald"],
        .ds .bg-white button[class*="bg-indigo"],
        .ds .bg-white button[class*="bg-teal"],
        .ds .bg-white button[class*="bg-cyan"],
        .ds .bg-white [class*="bg-red-"],
        .ds .bg-white [class*="bg-blue-"],
        .ds .bg-white [class*="bg-green-"],
        .ds .bg-white [class*="bg-purple-"],
        .ds .bg-white [class*="bg-pink-"],
        .ds .bg-white [class*="bg-yellow-"],
        .ds .bg-white [class*="bg-orange-"],
        .ds .bg-white [class*="bg-emerald-"],
        .ds .bg-white [class*="bg-indigo-"],
        .ds .bg-white [class*="bg-teal-"],
        .ds .bg-white [class*="bg-cyan-"] {
          color: #ffffff !important;
        }
        .ds .bg-white button[class*="bg-red"] *,
        .ds .bg-white button[class*="bg-blue"] *,
        .ds .bg-white button[class*="bg-green"] *,
        .ds .bg-white button[class*="bg-purple"] *,
        .ds .bg-white button[class*="bg-pink"] *,
        .ds .bg-white button[class*="bg-yellow"] *,
        .ds .bg-white button[class*="bg-orange"] *,
        .ds .bg-white button[class*="bg-emerald"] *,
        .ds .bg-white button[class*="bg-indigo"] *,
        .ds .bg-white [class*="bg-red-"] *,
        .ds .bg-white [class*="bg-blue-"] *,
        .ds .bg-white [class*="bg-green-"] *,
        .ds .bg-white [class*="bg-purple-"] *,
        .ds .bg-white [class*="bg-pink-"] *,
        .ds .bg-white [class*="bg-yellow-"] *,
        .ds .bg-white [class*="bg-orange-"] *,
        .ds .bg-white [class*="bg-emerald-"] *,
        .ds .bg-white [class*="bg-indigo-"] * {
          color: #ffffff !important;
        }
        /* White/light bg buttons inside white cards — dark text */
        .ds .bg-white button.bg-white,
        .ds .bg-white button.bg-gray-100,
        .ds .bg-white button.bg-gray-50,
        .ds .bg-white button[class*="border-gray"] {
          color: #1a1528 !important;
          background-color: #f5f3f9 !important;
        }
        .ds .bg-white button.bg-white *,
        .ds .bg-white button.bg-gray-100 *,
        .ds .bg-white button.bg-gray-50 * {
          color: #1a1528 !important;
        }
        /* Hover: purple glow */
        .ds .bg-white:hover {
          border-color: #7c6aef !important;
          box-shadow: 0 0 12px rgba(124, 106, 239, 0.2) !important;
          transform: translateY(-1px);
        }
        /* Selected (border-2, ring-*) : stronger purple glow */
        .ds .bg-white.border-2,
        .ds .bg-white.ring-1,
        .ds .bg-white.ring-2 {
          border-color: #6c5ce7 !important;
          box-shadow: 0 0 16px rgba(124, 106, 239, 0.3) !important;
        }
        .ds .bg-white.border-2:hover,
        .ds .bg-white.ring-2:hover {
          box-shadow: 0 0 22px rgba(124, 106, 239, 0.4) !important;
        }

        /* ====== LAYER 4: Dark pills/badges INSIDE white cards ====== 
           Ratio badges (16:9, 9:16), dark bg badges, etc.
           These have bg-gray-800 or bg-black — need WHITE text */
        .ds .bg-white .bg-gray-800,
        .ds .bg-white .bg-gray-900,
        .ds .bg-white .bg-black,
        .ds .bg-white [class*="bg-blue-6"],
        .ds .bg-white [class*="bg-blue-5"],
        .ds .bg-white [class*="bg-indigo-"],
        .ds .bg-white [class*="bg-purple-"],
        .ds .bg-white [class*="bg-emerald-"],
        .ds .bg-white [class*="bg-green-5"],
        .ds .bg-white [class*="bg-green-6"] {
          color: #ffffff !important;
        }
        .ds .bg-white .bg-gray-800 *,
        .ds .bg-white .bg-gray-900 *,
        .ds .bg-white .bg-black *,
        .ds .bg-white [class*="bg-blue-6"] *,
        .ds .bg-white [class*="bg-blue-5"] *,
        .ds .bg-white [class*="bg-indigo-"] *,
        .ds .bg-white [class*="bg-purple-"] *,
        .ds .bg-white [class*="bg-emerald-"] *,
        .ds .bg-white [class*="bg-green-5"] *,
        .ds .bg-white [class*="bg-green-6"] * {
          color: #ffffff !important;
        }

        /* ====== LAYER 5: .bg-gray-50 / .bg-gray-100 — dark purple ====== */
        .ds .bg-gray-50 {
          background-color: #252040 !important;
          color: #e2e0ea !important;
        }
        .ds .bg-gray-50 * { color: #e2e0ea !important; }
        .ds .bg-gray-100 {
          background-color: #2a2440 !important;
          color: #e2e0ea !important;
        }
        .ds .bg-gray-100 * { color: #e2e0ea !important; }

        /* ====== LAYER 6: Remap text-gray-* ====== */
        .ds .text-gray-400 { color: #8a84a0 !important; }
        .ds .text-gray-500 { color: #9a94b0 !important; }
        .ds .text-gray-600 { color: #a09ab5 !important; }
        .ds .text-gray-700 { color: #b0a8c8 !important; }
        .ds .text-gray-800 { color: #c8c2d8 !important; }
        .ds .text-gray-900 { color: #e2e0ea !important; }
        .ds .text-black    { color: #e2e0ea !important; }

        /* ====== LAYER 7: Borders ====== */
        .ds .border,
        .ds .border-gray-200,
        .ds .border-gray-300,
        .ds .border-gray-400 {
          border-color: #4a4260 !important;
        }

        /* ====== LAYER 8: Buttons ====== */
        .ds button {
          color: #e2e0ea !important;
          transition: all 0.2s ease !important;
        }
        .ds button.bg-black,
        .ds button[class*="bg-blue"],
        .ds button[class*="bg-purple"],
        .ds button[class*="bg-indigo"],
        .ds button[class*="bg-emerald"],
        .ds button[class*="bg-green"] {
          color: #ffffff !important;
        }
        .ds .bg-blue-600 {
          background-color: #6c5ce7 !important;
        }
        .ds .bg-blue-600:hover {
          background-color: #7c6aef !important;
        }
        /* Make primary action buttons glow */
        .ds button.bg-black,
        .ds button[class*="bg-blue"],
        .ds button[class*="bg-purple"],
        .ds button[class*="bg-indigo"],
        .ds button[class*="bg-emerald"],
        .ds button[class*="bg-green"] {
          color: #ffffff !important;
          background: linear-gradient(135deg, #6c5ce7 0%, #3b82f6 100%) !important;
          box-shadow: 0 2px 12px rgba(108, 92, 231, 0.3) !important;
          border: none !important;
          transition: all 0.2s ease !important;
        }
        .ds button.bg-black:hover,
        .ds button[class*="bg-blue"]:hover,
        .ds button[class*="bg-purple"]:hover,
        .ds button[class*="bg-indigo"]:hover {
          box-shadow: 0 4px 20px rgba(108, 92, 231, 0.4) !important;
          transform: translateY(-1px);
        }
        /* Buttons inside white cards — dark text */
        .ds .bg-white button {
          color: #1a1528 !important;
        }
        .ds .bg-white button[class*="bg-blue"],
        .ds .bg-white button[class*="bg-purple"],
        .ds .bg-white button.bg-black {
          color: #ffffff !important;
        }

        /* ====== LAYER 9: Status badges ====== */
        .ds .bg-green-100 { background-color: rgba(34, 197, 94, 0.15) !important; }
        .ds .bg-green-100 * { color: #4ade80 !important; }
        .ds .bg-red-100 { background-color: rgba(239, 68, 68, 0.15) !important; }
        .ds .bg-red-100 * { color: #f87171 !important; }
        .ds .bg-yellow-100 { background-color: rgba(234, 179, 8, 0.15) !important; }
        .ds .bg-yellow-100 * { color: #facc15 !important; }
        .ds .bg-blue-100 { background-color: rgba(59, 130, 246, 0.15) !important; }
        .ds .bg-blue-100 * { color: #60a5fa !important; }

        /* ====== LAYER 10: Emerald/teal bordered cards ====== */
        .ds [class*="border-emerald"],
        .ds [class*="border-teal"] {
          color: #e2e0ea !important;
        }
        .ds [class*="border-emerald"] *,
        .ds [class*="border-teal"] * {
          color: #e2e0ea !important;
        }

        /* ====== LAYER 11: Scrollbar ====== */
        .ds ::-webkit-scrollbar { width: 6px; }
        .ds ::-webkit-scrollbar-track { background: transparent; }
        .ds ::-webkit-scrollbar-thumb { background: #4a4260; border-radius: 3px; }

        /* ====== LAYER 12: Shadow overrides ====== */
        .ds .hover\\:shadow:hover {
          box-shadow: 0 4px 12px rgba(60, 50, 100, 0.3) !important;
        }

        /* ====== LAYER 14: All buttons — exact specs ====== */

        /* --- ALL primary action buttons = Medium purple + white text --- */
        .ds main button.bg-black,
        .ds main button.bg-blue-600,
        .ds main button.bg-blue-500,
        .ds main button.bg-purple-600,
        .ds main button.bg-purple-500,
        .ds main button.bg-indigo-600,
        .ds main button.bg-indigo-500,
        .ds main button[class*="bg-blue-6"],
        .ds main button[class*="bg-blue-5"],
        .ds main button[class*="bg-purple-"],
        .ds main button[class*="bg-indigo-"] {
          background: #6c5ce7 !important;
          border: 1px solid rgba(167,139,250,0.6) !important;
          color: #ffffff !important;
          box-shadow: 0 0 16px rgba(108,92,231,0.25) !important;
          font-weight: 500 !important;
          transition: all 0.25s ease !important;
        }
        .ds main button.bg-black *,
        .ds main button.bg-blue-600 *,
        .ds main button.bg-blue-500 *,
        .ds main button[class*="bg-blue-6"] *,
        .ds main button[class*="bg-blue-5"] *,
        .ds main button[class*="bg-purple-"] *,
        .ds main button[class*="bg-indigo-"] * {
          color: #ffffff !important;
        }
        .ds main button.bg-black:hover,
        .ds main button.bg-blue-600:hover,
        .ds main button.bg-blue-500:hover,
        .ds main button.bg-purple-600:hover,
        .ds main button.bg-purple-500:hover,
        .ds main button.bg-indigo-600:hover,
        .ds main button.bg-indigo-500:hover,
        .ds main button[class*="bg-blue-6"]:hover,
        .ds main button[class*="bg-blue-5"]:hover,
        .ds main button[class*="bg-purple-"]:hover,
        .ds main button[class*="bg-indigo-"]:hover {
          background: #7c6aef !important;
          box-shadow: 0 0 28px rgba(108,92,231,0.4) !important;
          border-color: rgba(196,181,253,0.7) !important;
          transform: translateY(-1px);
        }

        /* --- + Create link on Projects = Medium purple + white --- */
        .ds main a.bg-blue-600,
        .ds main a.bg-blue-500,
        .ds main a[class*="bg-blue-6"],
        .ds main a[class*="bg-blue-5"] {
          background: #6c5ce7 !important;
          border: 1px solid rgba(167,139,250,0.6) !important;
          color: #ffffff !important;
          box-shadow: 0 0 16px rgba(108,92,231,0.25) !important;
          font-weight: 500 !important;
          transition: all 0.25s ease !important;
        }
        .ds main a.bg-blue-600 *,
        .ds main a.bg-blue-500 *,
        .ds main a[class*="bg-blue-6"] *,
        .ds main a[class*="bg-blue-5"] * {
          color: #ffffff !important;
        }
        .ds main a.bg-blue-600:hover,
        .ds main a.bg-blue-500:hover,
        .ds main a[class*="bg-blue-6"]:hover,
        .ds main a[class*="bg-blue-5"]:hover {
          background: #7c6aef !important;
          box-shadow: 0 0 28px rgba(108,92,231,0.4) !important;
          border-color: rgba(196,181,253,0.7) !important;
          transform: translateY(-1px);
        }

        /* --- Status/Done badges = Dark green + white text --- */
        .ds main .bg-green-500,
        .ds main .bg-green-600,
        .ds main .bg-green-100,
        .ds main [class*="bg-green-5"],
        .ds main [class*="bg-green-6"] {
          background: #16a34a !important;
          border: 1px solid rgba(34,197,94,0.5) !important;
          color: #ffffff !important;
          box-shadow: 0 0 10px rgba(34,197,94,0.15) !important;
        }
        .ds main .bg-green-500 *,
        .ds main .bg-green-600 *,
        .ds main .bg-green-100 *,
        .ds main [class*="bg-green-5"] *,
        .ds main [class*="bg-green-6"] * {
          color: #ffffff !important;
        }

        /* --- Delete buttons = Dark royal purple + white trash icon --- */
        .ds main button[class*="bg-red"],
        .ds main button[class*="text-red"] {
          background: #4c1d95 !important;
          border: 1px solid rgba(139,92,246,0.4) !important;
          color: #ffffff !important;
          box-shadow: 0 0 10px rgba(76,29,149,0.2) !important;
        }
        .ds main button[class*="bg-red"]:hover,
        .ds main button[class*="text-red"]:hover {
          background: #5b21b6 !important;
          border-color: rgba(167,139,250,0.6) !important;
          box-shadow: 0 0 18px rgba(91,33,182,0.3) !important;
        }
        .ds main button[class*="bg-red"] *,
        .ds main button[class*="text-red"] * {
          color: #ffffff !important;
        }
        /* Delete icon SVG — white */
        .ds main button[class*="bg-red"] svg,
        .ds main button[class*="text-red"] svg {
          color: #ffffff !important;
          stroke: #ffffff !important;
        }

        /* --- Secondary / outline buttons = subtle purple --- */
        .ds main button.border:not([class*="bg-blue"]):not([class*="bg-red"]):not([class*="bg-green"]):not([class*="bg-purple"]):not([class*="bg-black"]):not([class*="bg-indigo"]) {
          background: rgba(108, 92, 231, 0.08) !important;
          border-color: #4a4260 !important;
          color: #c8c2d8 !important;
          box-shadow: none !important;
        }
        .ds main button.border:not([class*="bg-blue"]):not([class*="bg-red"]):not([class*="bg-green"]):not([class*="bg-purple"]):not([class*="bg-black"]):not([class*="bg-indigo"]):hover {
          background: rgba(108, 92, 231, 0.15) !important;
          border-color: #7c6aef !important;
          color: #e2e0ea !important;
          box-shadow: 0 0 10px rgba(108, 92, 231, 0.12) !important;
        }

        /* --- Disabled buttons = flat --- */
        .ds main button:disabled,
        .ds main button[disabled] {
          background: #252040 !important;
          box-shadow: none !important;
          color: #5a5070 !important;
          border-color: #3a3555 !important;
          transform: none !important;
          cursor: not-allowed;
        }

        /* --- Buttons INSIDE white cards = medium dark purple + white text --- */
        .ds .bg-white button.bg-black,
        .ds .bg-white button[class*="bg-blue"],
        .ds .bg-white button[class*="bg-purple"],
        .ds .bg-white button[class*="bg-indigo"] {
          background: #6c5ce7 !important;
          border: 1px solid rgba(167,139,250,0.5) !important;
          color: #ffffff !important;
          box-shadow: 0 0 14px rgba(108,92,231,0.2) !important;
        }
        .ds .bg-white button.bg-black *,
        .ds .bg-white button[class*="bg-blue"] *,
        .ds .bg-white button[class*="bg-purple"] *,
        .ds .bg-white button[class*="bg-indigo"] * {
          color: #ffffff !important;
        }
        .ds .bg-white button.bg-black:hover,
        .ds .bg-white button[class*="bg-blue"]:hover,
        .ds .bg-white button[class*="bg-purple"]:hover,
        .ds .bg-white button[class*="bg-indigo"]:hover {
          background: #7c6aef !important;
          box-shadow: 0 0 22px rgba(108,92,231,0.35) !important;
        }

        /* --- Face Left/Right, AI Generated, Face Upload inside white cards = dark text --- */
        .ds .bg-white button.bg-white,
        .ds .bg-white button.bg-gray-50,
        .ds .bg-white button.bg-gray-100,
        .ds .bg-white button.bg-gray-200,
        .ds .bg-white button[class*="border-gray"]:not([class*="bg-blue"]):not([class*="bg-purple"]):not([class*="bg-red"]):not([class*="bg-green"]):not([class*="bg-black"]):not([class*="bg-indigo"]) {
          background-color: #f5f3f9 !important;
          color: #1a1528 !important;
          border-color: #d0cce0 !important;
          box-shadow: none !important;
        }
        .ds .bg-white button.bg-white *,
        .ds .bg-white button.bg-gray-50 *,
        .ds .bg-white button.bg-gray-100 *,
        .ds .bg-white button.bg-gray-200 * {
          color: #1a1528 !important;
        }
        /* Selected state inside white cards */
        .ds .bg-white button.bg-white.border-2,
        .ds .bg-white button.bg-white.ring-1,
        .ds .bg-white button.bg-white.ring-2,
        .ds .bg-white button[class*="border-blue-"],
        .ds .bg-white button[class*="border-purple-"],
        .ds .bg-white button[class*="border-indigo-"] {
          background-color: #ede9fe !important;
          color: #1a1528 !important;
          border-color: #7c6aef !important;
          box-shadow: 0 0 10px rgba(108,92,231,0.15) !important;
        }
        .ds .bg-white button.bg-white.border-2 *,
        .ds .bg-white button.bg-white.ring-1 *,
        .ds .bg-white button.bg-white.ring-2 *,
        .ds .bg-white button[class*="border-blue-"] *,
        .ds .bg-white button[class*="border-purple-"] *,
        .ds .bg-white button[class*="border-indigo-"] * {
          color: #1a1528 !important;
        }

        /* ====== LAYER 13: Enterprise interactive elements ====== 
           Purple glow hover/focus for ALL clickable elements across all pages */

        /* --- Clickable cards (rounded + border pattern) --- */
        .ds a[class*="rounded"][class*="border"],
        .ds div[class*="rounded"][class*="border"][class*="cursor-pointer"],
        .ds div[role="button"][class*="rounded"] {
          transition: all 0.2s ease !important;
        }
        .ds a[class*="rounded"][class*="border"]:hover,
        .ds div[class*="rounded"][class*="border"][class*="cursor-pointer"]:hover,
        .ds div[role="button"][class*="rounded"]:hover {
          border-color: #7c6aef !important;
          box-shadow: 0 0 12px rgba(124, 106, 239, 0.15) !important;
        }

        /* --- All <a> links in main content — subtle purple hover --- */
        .ds main a {
          transition: all 0.2s ease !important;
        }
        .ds main a:hover {
          color: #c084fc !important;
        }

        /* --- Tabs / pill selectors (common pattern: flex children buttons) --- */
        .ds [role="tablist"] button,
        .ds [role="tab"] {
          transition: all 0.2s ease !important;
        }
        .ds [role="tablist"] button:hover,
        .ds [role="tab"]:hover {
          border-color: #7c6aef !important;
          box-shadow: 0 0 8px rgba(124, 106, 239, 0.15) !important;
        }
        .ds [role="tab"][aria-selected="true"],
        .ds [role="tablist"] button[aria-selected="true"] {
          border-color: #6c5ce7 !important;
          box-shadow: 0 0 14px rgba(124, 106, 239, 0.25) !important;
        }

        /* --- Select dropdowns — purple accent --- */
        .ds select {
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%237c6aef' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") !important;
          background-position: right 0.5rem center !important;
          background-repeat: no-repeat !important;
          background-size: 1.5em 1.5em !important;
          padding-right: 2.5rem !important;
          appearance: none !important;
          -webkit-appearance: none !important;
        }
        .ds select:hover {
          border-color: #7c6aef !important;
          box-shadow: 0 0 8px rgba(124, 106, 239, 0.12) !important;
        }

        /* --- Input fields hover glow --- */
        .ds input:hover, .ds textarea:hover {
          border-color: #5a5080 !important;
        }

        /* --- Toggle switches --- */
        .ds input[type="checkbox"],
        .ds [role="switch"] {
          accent-color: #6c5ce7 !important;
        }

        /* --- Range sliders --- */
        .ds input[type="range"] {
          accent-color: #6c5ce7 !important;
        }
        .ds input[type="range"]::-webkit-slider-thumb {
          box-shadow: 0 0 6px rgba(108, 92, 231, 0.4) !important;
        }

        /* --- Delete / destructive buttons — keep red --- */
        .ds button[class*="bg-red"],
        .ds button[class*="text-red"] {
          background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%) !important;
          box-shadow: 0 2px 10px rgba(220, 38, 38, 0.25) !important;
          color: #ffffff !important;
        }
        .ds button[class*="bg-red"]:hover,
        .ds button[class*="text-red"]:hover {
          box-shadow: 0 4px 16px rgba(220, 38, 38, 0.35) !important;
        }

        /* --- Secondary / outline buttons --- */
        .ds button.border,
        .ds button[class*="border-gray"],
        .ds button[class*="bg-gray-1"],
        .ds button[class*="bg-gray-2"] {
          background: rgba(124, 106, 239, 0.06) !important;
          border-color: #4a4260 !important;
          color: #c8c2d8 !important;
          box-shadow: none !important;
        }
        .ds button.border:hover,
        .ds button[class*="border-gray"]:hover,
        .ds button[class*="bg-gray-1"]:hover,
        .ds button[class*="bg-gray-2"]:hover {
          background: rgba(124, 106, 239, 0.12) !important;
          border-color: #7c6aef !important;
          color: #e2e0ea !important;
          box-shadow: 0 0 10px rgba(124, 106, 239, 0.12) !important;
          transform: translateY(-1px);
        }

        /* --- Project list items (clickable rows) --- */
        .ds [class*="hover:shadow"] {
          transition: all 0.2s ease !important;
        }

        /* --- Rounded card containers — purple hover glow --- */
        .ds .rounded-2xl {
          transition: all 0.2s ease !important;
        }
        .ds a.rounded-2xl:hover,
        .ds .rounded-2xl[class*="hover:"]:hover {
          box-shadow: 0 0 14px rgba(124, 106, 239, 0.12) !important;
        }

        /* --- Disabled state --- */
        .ds button:disabled,
        .ds button[disabled] {
          background: #2a2440 !important;
          box-shadow: none !important;
          color: #5a5070 !important;
          transform: none !important;
          cursor: not-allowed;
        }

        /* --- Focus ring for accessibility --- */
        .ds button:focus-visible,
        .ds a:focus-visible,
        .ds input:focus-visible,
        .ds select:focus-visible,
        .ds textarea:focus-visible {
          outline: 2px solid #7c6aef !important;
          outline-offset: 2px !important;
        }
      `}</style>

      <div className="ds flex min-h-screen bg-[#261f38]">
        <Sidebar />

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <Toaster />
    </ToastProvider>
  );
}
