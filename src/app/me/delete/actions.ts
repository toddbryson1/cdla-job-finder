"use server";

// CCPA right-to-delete server action. Invoked from /me/delete's
// confirmation form. Soft-deletes the driver row in place:
//   - deleted_at = now()
//   - PII columns NULL'd (or replaced with deterministic placeholder
//     where a UNIQUE constraint forces a value, e.g. drivers.email)
//   - both auth cookies cleared
//
// Relational rows (applications, matches, partner stages) are NOT
// cascade-deleted. The anonymized driver row breaks the identity
// link; the downstream records remain available for aggregate
// funnel metrics on /admin without rewriting history.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import { SESSION_COOKIE } from "@/lib/stytch/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteMyData(): Promise<void> {
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;

  // Same two-path auth as /me itself. Re-resolved here rather than
  // passed from the page so the action is hard to forge.
  let driverId: string | null = null;
  if (cookieDriverId && UUID_RE.test(cookieDriverId)) {
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, cookieDriverId),
      columns: { id: true, deletedAt: true },
    });
    if (row && row.deletedAt == null) driverId = row.id;
  }
  if (!driverId) {
    const session = await getSessionState();
    if (session.kind === "ok") {
      const row = await db.query.drivers.findFirst({
        where: eq(drivers.email, session.email),
        columns: { id: true, deletedAt: true },
      });
      if (row && row.deletedAt == null) driverId = row.id;
    }
  }
  if (!driverId) {
    redirect("/login?redirect=/me/delete");
  }

  // drivers.email has a UNIQUE constraint; we can't set it null.
  // Use a deterministic deleted-domain placeholder keyed on the
  // driver ID so the row stays queryable for ops debugging if
  // needed, while being unrecoverable as an actual email.
  const placeholderEmail = `deleted+${driverId}@cdla.invalid`;

  await db
    .update(drivers)
    .set({
      deletedAt: new Date(),
      firstName: null,
      lastName: null,
      email: placeholderEmail,
      phone: null,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      homeZip: null,
    })
    .where(eq(drivers.id, driverId));

  // Clear both auth cookies — fully sign the user out before they
  // bounce to the post-delete confirmation.
  cookieStore.set("cdla_driver_id", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  redirect("/me/delete?done=1");
}
