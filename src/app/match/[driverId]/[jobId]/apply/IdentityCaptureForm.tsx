"use client";

// Identity-capture step for anonymous-intake drivers. Renders on the
// /apply page when the driver row has null email/firstName/lastName/
// phone — i.e., they completed intake without committing.
//
// On submit:
//   - Updates the driver row with name/email/phone + address
//   - Triggers the candidate email + nurture schedule
//   - Sends a Stytch magic link so the driver can return later
//   - Redirects back to /match/[driverId]/[jobId]/apply to continue
//     the consent + safety + result flow
//
// Address fields land in migration 0026 so the Anderson handoff
// (Sterling QuickBase push) carries real Street/City/State instead
// of the empty strings the previous schema-gap TODO sent. Required
// for every driver, not just Anderson-bound ones — most partner
// ATSes will eventually want them.
//
// Voice: warm, plain, explains WHY the info is needed at this point
// (the carrier needs to reach them, and address gets to their ATS).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimIdentity } from "./actions";

interface Props {
  driverId: string;
  jobId: string;
}

export function IdentityCaptureForm({ driverId, jobId }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) return setError("First name is required.");
    if (!lastName.trim()) return setError("Last name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("That doesn't look like an email.");
    if (!/^\+?[\d\s().-]{10,}$/.test(phone))
      return setError("Phone needs at least 10 digits.");
    if (addressStreet.trim().length < 2)
      return setError("Street address is required.");
    if (!addressCity.trim()) return setError("City is required.");
    if (!/^[A-Za-z]{2}$/.test(addressState.trim()))
      return setError("Use the 2-letter state code (like TX or GA).");

    startTransition(async () => {
      const result = await claimIdentity({
        driverId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        addressStreet: addressStreet.trim(),
        addressCity: addressCity.trim(),
        addressState: addressState.trim().toUpperCase(),
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again in a moment.");
        return;
      }
      // Refresh the apply page; the server-side check will now see
      // contact info on the driver row and render the consent step.
      router.push(`/match/${driverId}/${jobId}/apply`);
      router.refresh();
    });
  }

  const inputClass =
    "mt-1 block w-full rounded-md border border-brand-rule bg-brand-paper px-3 py-2 text-sm text-brand-ink focus:border-brand-medium focus:outline-none disabled:opacity-50";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-brand-ink">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            className={inputClass}
            disabled={isPending}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-brand-ink">Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            className={inputClass}
            disabled={isPending}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-brand-ink">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          className={inputClass}
          disabled={isPending}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-brand-ink">Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          className={inputClass}
          disabled={isPending}
        />
      </label>

      <fieldset className="space-y-3 rounded-md border border-brand-rule bg-brand-surface p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-muted">
          Mailing address
        </legend>
        <label className="block">
          <span className="text-sm font-medium text-brand-ink">
            Street address
          </span>
          <input
            value={addressStreet}
            onChange={(e) => setAddressStreet(e.target.value)}
            autoComplete="street-address"
            placeholder="123 Main St"
            className={inputClass}
            disabled={isPending}
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
          <label className="block">
            <span className="text-sm font-medium text-brand-ink">City</span>
            <input
              value={addressCity}
              onChange={(e) => setAddressCity(e.target.value)}
              autoComplete="address-level2"
              className={inputClass}
              disabled={isPending}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-brand-ink">State</span>
            <input
              value={addressState}
              onChange={(e) =>
                setAddressState(e.target.value.toUpperCase().slice(0, 2))
              }
              autoComplete="address-level1"
              placeholder="TX"
              maxLength={2}
              className={inputClass}
              disabled={isPending}
            />
          </label>
        </div>
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-md bg-brand-deep px-5 text-sm font-semibold text-brand-paper hover:bg-brand-medium disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Continue"}
      </button>

      <p className="mt-2 text-xs leading-5 text-brand-muted">
        We won&rsquo;t share your info with any carrier until you
        consent on the next step. You&rsquo;ll get a magic link by
        email so you can come back later without typing anything.
        Your address goes only to the carrier you choose to apply with.
      </p>
    </form>
  );
}
