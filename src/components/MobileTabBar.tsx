"use client";

// Mobile-only bottom tab bar — the "app shell" affordance from the Jun 9
// homepage design ("cdla jobs/cdlajobs-homepage-design (1).html"). Renders
// on every driver-facing SiteShell page below the `sm` breakpoint and is
// hidden on desktop, where the sticky header nav already covers wayfinding.
//
// Targets are resolved server-side in SiteShell from the anonymous-intake
// cookie and passed in as hrefs; this component only needs the pathname to
// decide which tab reads as active. Each tab's `match` is a set of path
// prefixes that should light it up (e.g. a returning driver's Jobs tab
// points at /matches/[id], so /matches highlights Jobs).

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface MobileTabBarProps {
  chatHref: string;
  jobsHref: string;
  profileHref: string;
}

type TabId = "chat" | "jobs" | "profile";

interface Tab {
  id: TabId;
  label: string;
  href: string;
  /** Path prefixes that mark this tab active. "/" matches the homepage exactly. */
  match: string[];
  icon: React.ReactNode;
}

// Icons ported verbatim from the design mockup (line-style, 24px box).
const ICONS: Record<TabId, React.ReactNode> = {
  chat: (
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-4-.8L3 21l1.3-3.9A7.96 7.96 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  ),
  jobs: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </>
  ),
};

function isActive(pathname: string, match: string[]): boolean {
  return match.some((m) =>
    m === "/" ? pathname === "/" : pathname.startsWith(m),
  );
}

export function MobileTabBar({
  chatHref,
  jobsHref,
  profileHref,
}: MobileTabBarProps) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { id: "chat", label: "Chat", href: chatHref, match: ["/"], icon: ICONS.chat },
    {
      id: "jobs",
      label: "Jobs",
      href: jobsHref,
      match: ["/matches", "/carriers"],
      icon: ICONS.jobs,
    },
    {
      id: "profile",
      label: "Profile",
      href: profileHref,
      match: ["/me", "/login"],
      icon: ICONS.profile,
    },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-around border-t border-brand-rule bg-brand-paper pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:hidden"
    >
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.match);
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-[3px] text-[11px] font-semibold transition-colors ${
              active ? "text-brand-deep" : "text-brand-muted"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`h-[22px] w-[22px] ${active ? "text-brand-gold" : ""}`}
            >
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
