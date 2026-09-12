"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type TabKey = "overview" | "jobs" | "customers" | "reports";

function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5v-5.5h5v5.5" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4 8.4 15.6" />
      <path d="m14.2 14.2 5.8 5.8" />
      <path d="m8.4 8.4 3.4 3.4" />
    </svg>
  );
}
function IconCustomers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M3 20.5v-1a6 6 0 0 1 12 0v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 14.6a6 6 0 0 1 3.5 5.4v.5" />
    </svg>
  );
}
function IconReports() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-4" />
      <path d="M13 17V7" />
      <path d="M18 17v-7" />
    </svg>
  );
}

const TABS: { key: TabKey; label: string; href: string; icon: ReactNode }[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: <IconHouse /> },
  { key: "jobs", label: "Jobs", href: "/jobs", icon: <IconScissors /> },
  { key: "customers", label: "Customers", href: "/customers", icon: <IconCustomers /> },
  { key: "reports", label: "Reports", href: "/reports", icon: <IconReports /> },
];

export default function TabBar({
  active,
  fab,
}: {
  active: TabKey;
  fab?: ReactNode;
}) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
      <div className="relative mx-auto w-full max-w-107.5">
        {fab}
        <div className="pointer-events-auto flex h-16 items-center rounded-t-3xl bg-(--hig-bar) px-2 shadow-(--hig-bar-shadow) backdrop-blur-[20px] backdrop-saturate-150">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl transition-all duration-200 active:scale-95 ${
                  isActive
                    ? "bg-(--hig-accent-tint) text-(--hig-accent)"
                    : "text-(--hig-label-tertiary)"
                }`}
              >
                <span className="h-5.5 w-5.5">{tab.icon}</span>
                <span
                  className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}