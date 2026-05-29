// Generate a useful description for a TA Dedicated job from the
// openings sheet's Division string alone — for minimal-quality jobs
// where no detail tab is resolved.
//
// Division strings carry more semantic info than they look:
//   "Advance Auto Parts / Carquest — Blaine, MN Line Haul"
//   → account: Advance Auto Parts / Carquest
//   → city, state: Blaine, MN
//   → role: line-haul (~point-A-to-point-B, longer runs)
//
//   "Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun, M, W, F)"
//   → account: Ecolab
//   → city, state: Joliet, IL
//   → role: shuttle (short-route, usually home-daily)
//   → shift: 3rd shift
//   → schedule: Sun, M, W, F
//
//   "3M Team Dekalb-Houston"
//   → account: 3M
//   → role: team-driving
//   → corridor: Dekalb-Houston
//
// We extract what we can and write honest copy. We never make up pay
// rates or home time — those come from the carrier in the application
// step. The description's job is to give a CDL-A driver enough context
// to decide whether to apply.

import { polishDivisionForTitle } from "./display-title";

interface DivisionSemantics {
  /** Polished account name (with abbreviations expanded). */
  account: string | null;
  city: string | null;
  state: string | null;
  /** Top-level role/lane type, lowercased noun. */
  role: TaRole | null;
  /** Shift if explicit (1st / 2nd / 3rd / "overnight"). */
  shift: string | null;
  /** Days-of-week schedule notes in parentheticals. */
  scheduleNotes: string | null;
}

type TaRole =
  | "solo"
  | "team"
  | "flex"
  | "shuttle"
  | "line-haul"
  | "final-mile"
  | "yard"
  | "feeder"
  | "owner-operator"
  | "regional"
  | "longhaul";

// Order matters — longer patterns first so "line haul" beats "line".
const ROLE_PATTERNS: Array<[RegExp, TaRole]> = [
  [/\bline[- ]?haul\b/i, "line-haul"],
  [/\bfinal[- ]?mile\b/i, "final-mile"],
  [/\bowner[- ]?operators?\b/i, "owner-operator"],
  [/\bovernight\b/i, "shuttle"],
  [/\byard\b/i, "yard"],
  [/\bshuttle\b/i, "shuttle"],
  [/\bfeeder\b/i, "feeder"],
  [/\bregional\b/i, "regional"],
  [/\blong[- ]?haul\b/i, "longhaul"],
  [/\bteam\b/i, "team"],
  [/\bflex\b/i, "flex"],
  [/\bsolo\b/i, "solo"],
];

const SHIFT_PATTERN = /\b(1st|2nd|3rd|first|second|third)\s*shift\b/i;

/**
 * Pull semantics out of a Division string. Used by both the
 * description generator and the title polish.
 */
export function parseDivisionSemantics(division: string): DivisionSemantics {
  const polished = polishDivisionForTitle(division);

  // Account = the part BEFORE the dash separator (em-dash or hyphen)
  // and BEFORE any "City, ST" pattern.
  // Walk through the polished string and split at the first em-dash
  // or " - " separator.
  let account: string | null = null;
  const dashSplit = polished.split(/\s*[-—]\s+/, 2);
  if (dashSplit.length >= 1) {
    const candidate = dashSplit[0].trim();
    // Reject empty or single-character "accounts"
    if (candidate.length >= 2) account = candidate;
  }

  // City + State from anywhere in the polished string
  let city: string | null = null;
  let state: string | null = null;
  const cityStateMatch = polished.match(
    /([A-Za-z .']+),\s*([A-Z]{2})\b/,
  );
  if (cityStateMatch) {
    city = cityStateMatch[1].trim();
    state = cityStateMatch[2].toUpperCase();
  }

  // Role from anywhere
  let role: TaRole | null = null;
  for (const [rx, r] of ROLE_PATTERNS) {
    if (rx.test(polished)) {
      role = r;
      break;
    }
  }

  // Shift
  let shift: string | null = null;
  const shiftMatch = polished.match(SHIFT_PATTERN);
  if (shiftMatch) {
    const word = shiftMatch[1].toLowerCase();
    const map: Record<string, string> = {
      "1st": "1st shift",
      first: "1st shift",
      "2nd": "2nd shift",
      second: "2nd shift",
      "3rd": "3rd shift",
      third: "3rd shift",
    };
    shift = map[word] ?? null;
  }

  // Schedule notes from any parenthetical
  let scheduleNotes: string | null = null;
  // The polish strips TRAILING parentheticals; check the original.
  const parenMatch = division.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    // Filter out parentheticals that are just driver counts ("1 for X")
    // or shift counts. Keep the day-of-week stuff.
    if (
      /\b(sun|mon|tue|wed|thu|fri|sat)\b/i.test(inside) ||
      /\b(am|pm)\b/i.test(inside)
    ) {
      scheduleNotes = inside;
    }
  }

  return { account, city, state, role, shift, scheduleNotes };
}

/**
 * Produce a human-readable, accurate description for a minimal-
 * quality TA Dedicated job. Drivers see this on the /job/[slug]
 * page and Google sees it in JobPosting.description.
 *
 * We intentionally don't quote pay, exact home-time, or specific
 * miles — those vary by account and come from the recruiter. We
 * give enough context (account, role, location) to decide whether
 * to apply.
 */
export function buildMinimalDescription(division: string): string {
  const sem = parseDivisionSemantics(division);

  // Lead sentence — what's the job
  const lead = leadSentence(sem);

  // Context — what we know about this kind of dedicated freight
  const context = roleContext(sem.role);

  // Honesty paragraph — what the driver should expect from here
  const honesty = honestyClause(sem);

  return [lead, context, honesty].filter(Boolean).join("\n\n");
}

function leadSentence(sem: DivisionSemantics): string {
  const parts: string[] = [];
  // Role verb
  if (sem.role) {
    const verbs: Record<TaRole, string> = {
      solo: "Run a solo dedicated lane",
      team: "Run team dedicated lanes",
      flex: "Run a flex dedicated lane",
      shuttle: "Run dedicated shuttle routes",
      "line-haul": "Run dedicated line-haul lanes",
      "final-mile": "Run dedicated final-mile delivery routes",
      yard: "Run a yard-jockey position",
      feeder: "Run dedicated feeder lanes",
      "owner-operator": "Lease on as an owner-operator",
      regional: "Run dedicated regional lanes",
      longhaul: "Run dedicated long-haul lanes",
    };
    parts.push(verbs[sem.role]);
  } else {
    parts.push("Run a dedicated lane");
  }

  // Account
  if (sem.account) parts.push(`for the ${sem.account} dedicated account`);

  // Location
  if (sem.city && sem.state) parts.push(`out of ${sem.city}, ${sem.state}`);
  else if (sem.state) parts.push(`based in ${sem.state}`);

  // Shift
  if (sem.shift) parts.push(`on ${sem.shift}`);

  // Day-of-week schedule
  if (sem.scheduleNotes) parts.push(`(${sem.scheduleNotes})`);

  return parts.join(" ").replace(/\s+/g, " ").trim() + ".";
}

function roleContext(role: TaRole | null): string {
  const contexts: Record<TaRole, string> = {
    solo: "Solo dedicated runs are one driver per truck on a consistent customer account. Routes are predictable, the freight is the same, and you build a relationship with the receiver. Most solo dedicated lanes run home weekly with a 34-hour restart.",
    team: "Team dedicated runs are two drivers per truck — you and your partner. The truck keeps moving while one of you sleeps, so team lanes typically cover more miles per week than solo. Pay is usually split between the two drivers.",
    flex: "Flex dedicated drivers cover whatever the account needs that week — multiple routes on the same dedicated lane, with the schedule built around the customer's freight cycle. Usually home weekly.",
    shuttle: "Shuttle runs are short, predictable routes between two points — typically a yard and a nearby distribution center. Most shuttle drivers are home daily. Days are full but you sleep in your own bed.",
    "line-haul": "Line-haul runs are longer point-to-point lanes, often between regional distribution centers. The schedule is predictable; the routes are the same each week. Home time depends on the lane length — anything from weekly to biweekly.",
    "final-mile": "Final-mile delivery routes serve the same customer locations daily or weekly. You'll do multiple stops per shift with mostly no-touch or light-touch freight. Most final-mile drivers are home daily or home weekly.",
    yard: "Yard-jockey positions stay on a single property — moving trailers between docks and parking spots. No public roads, no DOT logging in the traditional sense. Home daily on a fixed schedule.",
    feeder: "Feeder runs are line-haul between two sort facilities, typically overnight. The schedule is consistent; the routes are the same every week.",
    "owner-operator":
      "Owner-operator lease-on positions run your own truck under Transport America's authority. You bring the truck and your CDL-A; Transport America brings the freight, the load-planning, and the back-office.",
    regional: "Regional dedicated runs cover a tighter geographic footprint than over-the-road. Most regional drivers are home weekly; some are home multiple times a week.",
    longhaul: "Long-haul dedicated runs cover the broader US with longer turn cycles. Drivers are usually home every 2-3 weeks, but the lane itself is consistent.",
  };
  return role ? contexts[role] : "";
}

function honestyClause(sem: DivisionSemantics): string {
  const parts: string[] = [];
  parts.push(
    "Specific pay, miles, home-time schedule, and equipment details for this opening come from Transport America's recruiter after we share your profile.",
  );
  parts.push(
    "Transport America is recruited by DLM Professional — they handle the application and answer questions about the account before you commit.",
  );
  void sem;
  return parts.join(" ");
}
