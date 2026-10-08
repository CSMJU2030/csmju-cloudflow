"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import CsmjuLogo from "./CsmjuLogo";
import {
  AddIcon,
  ArrowBackIcon,
  CampaignIcon,
  CloseIcon,
  DashboardIcon,
  DescriptionIcon,
  EventIcon,
  GroupIcon,
  LogoutIcon,
  MeetingRoomIcon,
  MenuBookIcon,
  MenuIcon,
  NotificationsIcon,
  ReceiptIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";

/**
 * Icons a nav item may use. Nav config is passed from the (server) root
 * layout, so icons are referenced by name instead of by component.
 */
const NAV_ICONS = {
  dashboard: DashboardIcon,
  group: GroupIcon,
  school: SchoolIcon,
  campaign: CampaignIcon,
  settings: SettingsIcon,
  "meeting-room": MeetingRoomIcon,
  "menu-book": MenuBookIcon,
  receipt: ReceiptIcon,
  event: EventIcon,
  description: DescriptionIcon,
};

export type NavIconName = keyof typeof NAV_ICONS;

export type NavItem = {
  /** Thai label (primary). */
  label: string;
  /** Optional English caption shown faded next to the Thai label. */
  labelEn?: string;
  href: string;
  icon: NavIconName;
};

/**
 * Every subsystem's sign-out (auth-contract.md 5): a POST to its own
 * /auth/logout, which next.config.ts passes on to the backend. The backend
 * clears the session cookie and answers 303 to Core Hub's /logout. A link
 * (GET) would not reach that route.
 */
const LOGOUT_ACTION = "/auth/logout";

const FOOTER_LINKS = [
  "ติดต่อเรา",
  "นโยบายความเป็นส่วนตัว",
  "ทำเนียบบุคลากร",
  "ปฏิทินการศึกษา",
];

export default function CsmjuAppShell({
  displayName,
  nav,
  primaryAction,
  user,
  coreHubUrl,
  children,
}: {
  /** Subsystem name shown in the mobile top bar, e.g. "ระบบครุภัณฑ์". */
  displayName: string;
  nav: NavItem[];
  /**
   * Core Hub web origin (env CORE_HUB_WEB_URL), for the "back to the portal"
   * link every subsystem shows (ui-design-system.md 1, 5.1). No link when unset.
   */
  coreHubUrl?: string;
  /** Optional gradient button under the logo, e.g. { label: "สร้างประกาศใหม่", href: "/news/new" }. */
  primaryAction?: { label: string; href: string };
  user: { initials: string; roleLabel: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);
  const rootHref = nav[0]?.href ?? "/";

  return (
    <div className="flex min-h-dvh w-full bg-background text-on-surface">
      {/* Scrim for the mobile drawer */}
      <div
        onClick={closeNav}
        aria-hidden
        className={`fixed inset-0 z-20 bg-black/40 transition-opacity duration-300 md:hidden ${
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* SIDE NAV */}
      <aside
        className={`brand-gradient fixed left-0 top-0 z-30 flex h-dvh w-64 flex-col py-4 shadow-xl transition-transform duration-300 ease-out md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 shrink-0 px-4 pt-4">
          <div className="mb-6 flex items-center justify-between gap-2">
            <CsmjuLogo framed priority className="w-full" />
            <button
              type="button"
              onClick={closeNav}
              aria-label="ปิดเมนู"
              className="self-start rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {coreHubUrl && (
            // Out of this subsystem to the Core Hub portal the user signed in
            // from — a real navigation to another origin, so <a>, not Link.
            <a
              href={coreHubUrl}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-label-md text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                primaryAction ? "mb-4" : ""
              }`}
            >
              <ArrowBackIcon className="h-4 w-4 shrink-0" />
              กลับ CSMJU Portal
            </a>
          )}

          {primaryAction && (
            <Link
              href={primaryAction.href}
              onClick={closeNav}
              className="btn-gradient flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-label-md text-white shadow-md"
            >
              <AddIcon className="h-4 w-4" />
              {primaryAction.label}
            </Link>
          )}
        </div>

        {/* The menu scrolls on its own so sign-out below stays on screen. */}
        <nav className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ul className="space-y-1">
            {nav.map(({ href, label, labelEn, icon }) => {
              const Icon = NAV_ICONS[icon];
              const active =
                href === rootHref ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={closeNav}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 py-3 duration-200 ${
                      active
                        ? "border-l-4 border-accent bg-white/10 pl-6 text-white"
                        : "pl-7 text-white/70 transition-all hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-label-md">{label}</span>
                    {labelEn && (
                      <span className="text-caption text-white/50">{labelEn}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form action={LOGOUT_ACTION} method="post" className="mx-4 mt-4 shrink-0">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 py-2.5 text-label-md text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <LogoutIcon className="h-4 w-4" />
            ออกจากระบบ
          </button>
        </form>
      </aside>

      {/* MAIN */}
      <main id="main" className="ml-0 flex min-h-dvh flex-1 flex-col md:ml-64">
        <header className="sticky top-0 z-10 flex h-16 w-full items-center justify-between gap-4 border-b border-surface-variant bg-surface-container-lowest px-4 shadow-sm md:px-12">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="เปิดเมนู"
              className="rounded-lg p-2 text-on-surface transition-colors hover:bg-surface-variant/50"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
            <span className="text-gradient font-display text-headline-md">
              {displayName}
            </span>
          </div>

          <div className="relative mx-auto hidden max-w-md flex-1 items-center md:flex">
            <SearchIcon className="pointer-events-none absolute left-3 h-5 w-5 text-outline" />
            <input
              type="search"
              placeholder="ค้นหา..."
              aria-label="ค้นหา"
              className="w-full rounded-full border border-outline-variant/50 bg-surface py-2.5 pl-10 pr-4 text-body-md transition-colors focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container"
            />
          </div>

          <div className="flex items-center gap-2 text-on-surface-variant">
            <button
              type="button"
              aria-label="การแจ้งเตือน"
              className="relative rounded-full p-2 transition-colors hover:bg-surface-variant/50 hover:text-primary-container active:opacity-80"
            >
              <NotificationsIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-surface-variant/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/50 bg-primary-container text-label-md text-white shadow-sm">
                {user.initials}
              </span>
              <span className="hidden text-label-md text-on-surface md:inline">
                {user.roleLabel}
              </span>
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1280px] flex-1 space-y-8 p-4 md:p-12">
          {children}
        </div>

        <footer className="mt-auto w-full border-t border-outline-variant/30 bg-surface-container-low py-8">
          <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-6 px-4 md:grid-cols-2 md:px-12">
            <p className="text-body-md text-on-surface-variant">
              © {new Date().getFullYear()} Computer Science, Maejo University
            </p>
            <div className="flex flex-wrap gap-6 md:justify-end">
              {FOOTER_LINKS.map((link) => (
                <a
                  key={link}
                  href="#"
                  className="text-label-sm text-on-surface-variant transition-colors hover:text-primary-container hover:underline"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
