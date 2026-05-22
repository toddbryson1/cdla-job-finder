"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EQUIPMENT_OPTIONS,
  ENDORSEMENT_OPTIONS,
  HOME_TIME_OPTIONS,
  REGION_PREF_OPTIONS,
  SAP_STATUS_OPTIONS,
  intakeSchema,
} from "@/lib/intake-schema";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hasClassA: boolean;
  cdlState: string;
  homeZip: string;
  yearsHeld: string;
  equipmentRun: string[];
  endorsements: string[];
  otrYears: string;
  desiredEquipment: string[];
  desiredRegions: string[];
  homeTime: "" | "daily" | "weekly" | "biweekly" | "otr";
  minWeeklyPay: string;
  willingToRelocate: boolean;
  accidents3yrCount: string;
  accidentsDetails: string;
  tickets3yrCount: string;
  duiEver: "" | "yes" | "no";
  duiMostRecentDate: string;
  felonyEver: "" | "yes" | "no";
  felonyDetails: string;
  terminatedFromAnyOfLast3Employers: "" | "yes" | "no";
  failedDotTest: "" | "yes" | "no";
  sapStatus: "not-in-sap" | "in-sap" | "completed-sap";
  attestAccurate: boolean;
  consentToShare: boolean;
  smsOptIn: boolean;
};

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  hasClassA: false,
  cdlState: "",
  homeZip: "",
  yearsHeld: "",
  equipmentRun: [],
  endorsements: [],
  otrYears: "",
  desiredEquipment: [],
  desiredRegions: [],
  homeTime: "",
  minWeeklyPay: "",
  willingToRelocate: false,
  accidents3yrCount: "",
  accidentsDetails: "",
  tickets3yrCount: "",
  duiEver: "",
  duiMostRecentDate: "",
  felonyEver: "",
  felonyDetails: "",
  terminatedFromAnyOfLast3Employers: "",
  failedDotTest: "",
  sapStatus: "not-in-sap",
  attestAccurate: false,
  consentToShare: false,
  smsOptIn: false,
};

const STEPS = ["Contact + CDL", "Experience", "What you want", "Safety + consent"] as const;

export function IntakeForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function toggleIn(key: "equipmentRun" | "endorsements" | "desiredEquipment" | "desiredRegions", value: string) {
    setState((s) => {
      const arr = s[key];
      return { ...s, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function validateStep(currentStep: number): boolean {
    const next: Record<string, string> = {};
    if (currentStep === 0) {
      if (!state.firstName.trim()) next.firstName = "Required";
      if (!state.lastName.trim()) next.lastName = "Required";
      if (!state.email.trim()) next.email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) next.email = "That doesn't look like an email";
      if (!state.phone.trim()) next.phone = "Required";
      if (!state.hasClassA) next.hasClassA = "CDLA.jobs is for Class A drivers only";
      if (!state.cdlState.trim() || state.cdlState.trim().length !== 2)
        next.cdlState = "2-letter state code";
      if (!/^\d{5}$/.test(state.homeZip.trim()))
        next.homeZip = "5-digit US zip";
      if (!state.yearsHeld.trim()) next.yearsHeld = "Required";
    }
    if (currentStep === 1) {
      if (state.equipmentRun.length === 0) next.equipmentRun = "Pick at least one";
    }
    if (currentStep === 2) {
      if (state.desiredEquipment.length === 0) next.desiredEquipment = "Pick at least one";
      if (state.desiredRegions.length === 0) next.desiredRegions = "Pick at least one";
      if (!state.homeTime) next.homeTime = "Pick one";
    }
    if (currentStep === 3) {
      if (!state.accidents3yrCount.trim()) next.accidents3yrCount = "Enter a number";
      if (!state.tickets3yrCount.trim()) next.tickets3yrCount = "Enter a number";
      if (!state.duiEver) next.duiEver = "Please answer";
      if (!state.felonyEver) next.felonyEver = "Please answer";
      if (!state.terminatedFromAnyOfLast3Employers) next.terminatedFromAnyOfLast3Employers = "Please answer";
      if (!state.failedDotTest) next.failedDotTest = "Please answer";
      if (!state.attestAccurate) next.attestAccurate = "Required";
      if (!state.consentToShare) next.consentToShare = "Required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onNext() {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function onBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function onSubmit() {
    if (!validateStep(step)) return;
    const payload = {
      ...state,
      yearsHeld: Number(state.yearsHeld) || 0,
      otrYears: Number(state.otrYears) || 0,
      minWeeklyPay: Number(state.minWeeklyPay) || 0,
      accidents3yrCount: Number(state.accidents3yrCount) || 0,
      tickets3yrCount: Number(state.tickets3yrCount) || 0,
      duiEver: state.duiEver === "yes",
      felonyEver: state.felonyEver === "yes",
      terminatedFromAnyOfLast3Employers: state.terminatedFromAnyOfLast3Employers === "yes",
      failedDotTest: state.failedDotTest === "yes",
    };
    const parsed = intakeSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setSubmitError("Please fix the highlighted fields.");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          driverId?: string;
          error?: string;
        };
        if (!res.ok) {
          setSubmitError(body.error ?? "Something went wrong. Try again in a minute.");
          return;
        }
        if (body.driverId) {
          router.push(`/matches/${body.driverId}`);
        } else {
          router.push("/intake/done");
        }
      } catch {
        setSubmitError("Network error. Try again.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-brand-rule bg-white p-6 sm:p-8 shadow-sm">
      <Stepper current={step} />
      <div className="mt-6">
        {step === 0 && <StepContact state={state} set={set} errors={errors} />}
        {step === 1 && <StepExperience state={state} toggleIn={toggleIn} set={set} errors={errors} />}
        {step === 2 && <StepPreferences state={state} set={set} toggleIn={toggleIn} errors={errors} />}
        {step === 3 && <StepSafety state={state} set={set} errors={errors} />}
      </div>

      {submitError && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submitError}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0 || isPending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={onNext}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white hover:bg-brand-medium"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-gold px-6 text-sm font-semibold text-brand-ink hover:bg-brand-gold/90 disabled:opacity-60"
          >
            {isPending ? "Sending..." : "See my matches"}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                active ? "bg-brand-deep" : done ? "bg-brand-medium" : "bg-brand-rule"
              }`}
            />
            <div
              className={`mt-2 text-xs ${
                active ? "font-medium text-brand-ink" : "text-brand-muted"
              }`}
            >
              {i + 1}. {label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type SetFn = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
type ToggleFn = (
  key: "equipmentRun" | "endorsements" | "desiredEquipment" | "desiredRegions",
  value: string,
) => void;

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-brand-ink">{label}</span>
      {hint && <span className="block text-xs text-brand-muted mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

const inputClass =
  "block w-full rounded-md border border-brand-rule bg-white px-3 py-2.5 text-base text-brand-ink shadow-sm placeholder:text-brand-muted/70 focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30";

function StepContact({
  state,
  set,
  errors,
}: {
  state: FormState;
  set: SetFn;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-brand-ink">Who are you?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name" error={errors.firstName}>
          <input
            className={inputClass}
            value={state.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <input
            className={inputClass}
            value={state.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label="Email" error={errors.email}>
        <input
          type="email"
          className={inputClass}
          value={state.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      </Field>
      <Field label="Phone" error={errors.phone}>
        <input
          type="tel"
          className={inputClass}
          value={state.phone}
          onChange={(e) => set("phone", e.target.value)}
          autoComplete="tel"
          inputMode="tel"
        />
      </Field>

      <div className="rounded-lg bg-brand-surface p-4 space-y-3">
        <Field
          label="Do you have a Class A CDL?"
          hint="CDLA.jobs is Class A drivers only."
          error={errors.hasClassA}
        >
          <div className="flex gap-3">
            <YesNo value={state.hasClassA ? "yes" : ""} onChange={(v) => set("hasClassA", v === "yes")} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="State your CDL was issued in" hint="Two letters" error={errors.cdlState}>
            <input
              className={inputClass}
              value={state.cdlState}
              onChange={(e) => set("cdlState", e.target.value.toUpperCase())}
              maxLength={2}
              autoComplete="off"
            />
          </Field>
          <Field label="Years you've held a Class A" error={errors.yearsHeld}>
            <input
              className={inputClass}
              value={state.yearsHeld}
              onChange={(e) => set("yearsHeld", e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </Field>
        </div>
        <Field
          label="Home zip code"
          hint="5-digit US zip. We use this to find jobs you could actually drive from where you live."
          error={errors.homeZip}
        >
          <input
            className={inputClass}
            value={state.homeZip}
            onChange={(e) =>
              set("homeZip", e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            maxLength={5}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="30303"
          />
        </Field>
      </div>
    </div>
  );
}

function StepExperience({
  state,
  toggleIn,
  set,
  errors,
}: {
  state: FormState;
  toggleIn: ToggleFn;
  set: SetFn;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-brand-ink">What have you actually driven?</h2>
      <Field
        label="Equipment you've run"
        hint="Pick everything you have real seat time in."
        error={errors.equipmentRun}
      >
        <CheckGrid
          options={EQUIPMENT_OPTIONS}
          selected={state.equipmentRun}
          onToggle={(v) => toggleIn("equipmentRun", v)}
        />
      </Field>

      <Field label="Endorsements you hold" hint="Skip if none.">
        <CheckGrid
          options={ENDORSEMENT_OPTIONS}
          selected={state.endorsements}
          onToggle={(v) => toggleIn("endorsements", v)}
        />
      </Field>

      <Field label="Years of OTR experience" hint="Roughly. Zero is fine.">
        <input
          className={inputClass}
          value={state.otrYears}
          onChange={(e) => set("otrYears", e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
      </Field>
    </div>
  );
}

function StepPreferences({
  state,
  set,
  toggleIn,
  errors,
}: {
  state: FormState;
  set: SetFn;
  toggleIn: ToggleFn;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-brand-ink">What do you want?</h2>
      <Field label="Equipment you want to drive now" error={errors.desiredEquipment}>
        <CheckGrid
          options={EQUIPMENT_OPTIONS}
          selected={state.desiredEquipment}
          onToggle={(v) => toggleIn("desiredEquipment", v)}
        />
      </Field>

      <Field label="Regions you want to run" error={errors.desiredRegions}>
        <CheckGrid
          options={REGION_PREF_OPTIONS}
          selected={state.desiredRegions}
          onToggle={(v) => toggleIn("desiredRegions", v)}
        />
      </Field>

      <Field label="Home time" error={errors.homeTime}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {HOME_TIME_OPTIONS.map((opt) => (
            <RadioCard
              key={opt.value}
              name="homeTime"
              value={opt.value}
              label={opt.label}
              checked={state.homeTime === opt.value}
              onChange={(v) => set("homeTime", v as FormState["homeTime"])}
            />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Minimum weekly pay you'd take" hint="Dollars per week. Optional.">
          <input
            className={inputClass}
            value={state.minWeeklyPay}
            onChange={(e) => set("minWeeklyPay", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="$"
          />
        </Field>
        <Field label="Willing to relocate?">
          <YesNo
            value={state.willingToRelocate ? "yes" : "no"}
            onChange={(v) => set("willingToRelocate", v === "yes")}
          />
        </Field>
      </div>
    </div>
  );
}

function StepSafety({
  state,
  set,
  errors,
}: {
  state: FormState;
  set: SetFn;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-brand-ink">The safety stuff carriers ask anyway</h2>
      <p className="text-sm text-brand-muted">
        Six questions. Be honest — it comes out in the background check anyway, and we only
        match you to carriers that hire drivers with your specific history.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Accidents in the last 3 years" error={errors.accidents3yrCount}>
          <input
            className={inputClass}
            value={state.accidents3yrCount}
            onChange={(e) => set("accidents3yrCount", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="0"
          />
        </Field>
        <Field label="Moving violations in last 3 years" error={errors.tickets3yrCount}>
          <input
            className={inputClass}
            value={state.tickets3yrCount}
            onChange={(e) => set("tickets3yrCount", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="0"
          />
        </Field>
      </div>
      {Number(state.accidents3yrCount) > 0 && (
        <Field label="Brief details on those accidents">
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={state.accidentsDetails}
            onChange={(e) => set("accidentsDetails", e.target.value)}
            placeholder="Type, fault, year — just enough so a recruiter knows what to ask."
          />
        </Field>
      )}

      <Field label="Any DUI on your record, ever?" error={errors.duiEver}>
        <YesNo
          value={state.duiEver}
          onChange={(v) => set("duiEver", v as FormState["duiEver"])}
        />
      </Field>
      {state.duiEver === "yes" && (
        <Field label="Most recent DUI date" hint="Month and year is fine.">
          <input
            className={inputClass}
            value={state.duiMostRecentDate}
            onChange={(e) => set("duiMostRecentDate", e.target.value)}
            placeholder="e.g. March 2019"
          />
        </Field>
      )}

      <Field label="Any felony convictions, ever?" error={errors.felonyEver}>
        <YesNo
          value={state.felonyEver}
          onChange={(v) => set("felonyEver", v as FormState["felonyEver"])}
        />
      </Field>
      {state.felonyEver === "yes" && (
        <Field label="What kind, and when?">
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={state.felonyDetails}
            onChange={(e) => set("felonyDetails", e.target.value)}
          />
        </Field>
      )}

      <Field
        label="Terminated by any of your last 3 employers?"
        error={errors.terminatedFromAnyOfLast3Employers}
      >
        <YesNo
          value={state.terminatedFromAnyOfLast3Employers}
          onChange={(v) =>
            set("terminatedFromAnyOfLast3Employers", v as FormState["terminatedFromAnyOfLast3Employers"])
          }
        />
      </Field>

      <Field label="Ever failed a DOT drug or alcohol test?" error={errors.failedDotTest}>
        <YesNo
          value={state.failedDotTest}
          onChange={(v) => set("failedDotTest", v as FormState["failedDotTest"])}
        />
      </Field>
      {state.failedDotTest === "yes" && (
        <Field label="SAP status">
          <div className="grid grid-cols-1 gap-2">
            {SAP_STATUS_OPTIONS.map((opt) => (
              <RadioCard
                key={opt.value}
                name="sapStatus"
                value={opt.value}
                label={opt.label}
                checked={state.sapStatus === opt.value}
                onChange={(v) => set("sapStatus", v as FormState["sapStatus"])}
              />
            ))}
          </div>
        </Field>
      )}

      <div className="rounded-lg border border-brand-rule bg-brand-surface p-4 space-y-3">
        <CheckRow
          label="Everything I've told you is accurate."
          checked={state.attestAccurate}
          onChange={(v) => set("attestAccurate", v)}
          error={errors.attestAccurate}
        />
        <CheckRow
          label="I consent to CDLA.jobs sharing my info with the carriers I specifically pick. Not anyone else."
          checked={state.consentToShare}
          onChange={(v) => set("consentToShare", v)}
          error={errors.consentToShare}
        />
        <CheckRow
          label="Text me when new matches show up. (Reply STOP anytime.)"
          checked={state.smsOptIn}
          onChange={(v) => set("smsOptIn", v)}
        />
      </div>
    </div>
  );
}

function CheckGrid({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
              checked
                ? "border-brand-medium bg-brand-medium/5"
                : "border-brand-rule bg-white hover:bg-brand-surface"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-brand-rule text-brand-medium accent-brand-medium"
              checked={checked}
              onChange={() => onToggle(opt.value)}
            />
            <span className="text-sm text-brand-ink">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function RadioCard({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
        checked
          ? "border-brand-medium bg-brand-medium/5"
          : "border-brand-rule bg-white hover:bg-brand-surface"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="h-4 w-4 border-brand-rule text-brand-medium accent-brand-medium"
      />
      <span className="text-sm text-brand-ink">{label}</span>
    </label>
  );
}

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex gap-2">
      {[
        { v: "yes", label: "Yes" },
        { v: "no", label: "No" },
      ].map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`h-10 rounded-md px-5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-deep text-white"
                : "border border-brand-rule bg-white text-brand-ink hover:bg-brand-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-brand-rule text-brand-medium accent-brand-medium"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <span className="text-sm text-brand-ink">{label}</span>
        {error && <span className="block text-xs text-red-700 mt-0.5">{error}</span>}
      </div>
    </label>
  );
}
