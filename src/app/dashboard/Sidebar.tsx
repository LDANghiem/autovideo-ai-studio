// src/app/dashboard/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  FolderIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  PlusCircleIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

const menuItems = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { name: "Projects", href: "/dashboard/projects", icon: FolderIcon },
  { name: "Library", href: "/dashboard/library", icon: VideoCameraIcon },
  { name: "Settings", href: "/dashboard/settings", icon: Cog6ToothIcon },
  { name: "Create Project", href: "/dashboard/create", icon: PlusCircleIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  return (
    <aside
      className={`
        h-screen sticky top-0 transition-all duration-300
        bg-[var(--sidebar-bg)] border-r border-gray-800
        ${open ? "w-64" : "w-20"}
      `}
    >
      {/* Collapse Button */}
      <button
        className="absolute -right-3 top-4 bg-white text-black rounded-full p-1 shadow z-50"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <XMarkIcon className="h-5 w-5" />
        ) : (
          <Bars3Icon className="h-5 w-5" />
        )}
      </button>

      {/* Logo / Title */}
      <div className="px-6 py-6 text-lg font-semibold text-[var(--text-primary)]">
        {open ? "AutoVideo AI Studio" : "AV"}
      </div>

      {/* Menu Items */}
      <nav className="mt-4 space-y-2 px-2">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 text-sm rounded-lg
                transition-all duration-200 font-medium
                ${pathname === item.href
                  ? "bg-[var(--accent)] text-white shadow"
                  : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] hover:text-white"}
              `}
            >
              <Icon className="h-5 w-5" />
              {open && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
