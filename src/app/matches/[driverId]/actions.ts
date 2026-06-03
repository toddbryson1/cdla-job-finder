"use server";

// Server actions for /matches MatchCard interactions. Currently only:
//   - dismissCarrierAction: driver clicks "Not interested in this
//     carrier" on a card; we record the dismissal and revalidate
//     /matches so the card disappears on the next render.
//   - undismissCarrierAction: driver removes a dismissal from /me's
//     dismissed-carriers list.
//
// Auth re-resolved server-side from cookie or Stytch session — the
// driverId in the function arg is the URL's, never trusted by
// itself. (Otherwise anyone with the matches URL of another driver
// could dismiss on their behalf.)

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import {
  dismissCarrier,
  undismissCarrier,
} from "@/lib/dismissals";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check that the caller owns the driver row identified by URL.
 *  Returns the canonical driverId or null. Same two-path pattern as
 *  /matches, /me, /apply. */
async function authDriver(urlDriverId: string): Promise<string | null> {
  if (!UUID_RE.test(urlDriverId)) return null;
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;
  if (cookieDriverId === urlDriverId) {
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, urlDriverId),
      columns: { id: true, deletedAt: true },
    });
    if (row && row.deletedAt == null) return row.id;
  }
  const session = await getSessionState();
  if (session.kind !== "ok") return null;
  const row = await db.query.drivers.findFirst({
    where: eq(drivers.id, urlDriverId),
    columns: { id: true, email: true, deletedAt: true },
  });
  if (
    !row ||
    row.deletedAt != null ||
    !row.email ||
    row.email.toLowerCase() !== session.email
  ) {
    return null;
  }
  return row.id;
}

export async function dismissCarrierAction(
  driverId: string,
  carrierId: string,
): Promise<void> {
  if (!UUID_RE.test(carrierId)) return;
  const id = await authDriver(driverId);
  if (!id) return;
  await dismissCarrier(id, carrierId);
  revalidatePath(`/matches/${id}`);
  revalidatePath("/me");
}

export async function undismissCarrierAction(
  driverId: string,
  carrierId: string,
): Promise<void> {
  if (!UUID_RE.test(carrierId)) return;
  const id = await authDriver(driverId);
  if (!id) return;
  await undismissCarrier(id, carrierId);
  revalidatePath(`/matches/${id}`);
  revalidatePath("/me");
}
