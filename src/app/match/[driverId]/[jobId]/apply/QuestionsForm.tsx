"use client";

import { useState } from "react";
import { submitQuestions } from "./actions";

interface Props {
  driverId: string;
  jobId: string;
  carrierName: string;
}

const TICKET_BUCKETS = ["0", "1", "2", "3", "4+"] as const;
const ACCIDENT_BUCKETS = ["0", "1", "2", "3+"] as const;

function bucketToNumber(bucket: string): number {
  if (bucket.endsWith("+")) return Number(bucket.slice(0, -1));
  return Number(bucket);
}

export function QuestionsForm({ driverId, jobId, carrierName }: Props) {
  const [tickets, setTickets] = useState<string>("");
  const [accidents, setAccidents] = useState<string>("");
  const [atFault, setAtFault] = useState<string>("");
  const [duiEver, setDuiEver] = useState<"" | "yes" | "no">("");
  const [duiDate, setDuiDate] = useState<string>("");
  const [felonyEver, setFelonyEver] = useState<"" | "yes" | "no">("");

  const accidentsNum = accidents ? bucketToNumber(accidents) : null;
  const showAtFault = accidentsNum != null && accidentsNum > 0;

  const ready =
    tickets !== "" &&
    accidents !== "" &&
    (!showAtFault || atFault !== "") &&
    duiEver !== "" &&
    (duiEver === "no" || duiDate.trim().length > 0) &&
    felonyEver !== "";

  const action = submitQuestions.bind(null, driverId, jobId);

  return (
    <form action={action} className="space-y-8">
      <p className="text-sm leading-6 text-brand-muted">
        Three quick questions from{" "}
        <span className="font-medium text-brand-ink">{carrierName}</span>.
        Answer honestly — carriers verify everything against your MVR and PSP
        later.
      </p>

      {/* Hidden numeric values populated from selections */}
      <input
        type="hidden"
        name="tickets3yrCount"
        value={tickets === "" ? "" : String(bucketToNumber(tickets))}
      />
      <input
        type="hidden"
        name="accidents3yrCount"
        value={accidents === "" ? "" : String(bucketToNumber(accidents))}
      />
      <input
        type="hidden"
        name="accidents3yrAtFaultCount"
        value={
          showAtFault && atFault !== "" ? String(bucketToNumber(atFault)) : "0"
        }
      />
      <input type="hidden" name="duiEver" value={duiEver} />
      <input
        type="hidden"
        name="duiMostRecentDate"
        value={duiEver === "yes" ? duiDate : ""}
      />
      <input type="hidden" name="felonyEver" value={felonyEver} />

      <fieldset>
        <legend className="text-sm font-semibold text-brand-ink">
          In the past 3 years, how many moving violations have you had on your
          driving record?
        </legend>
        <p className="mt-1 text-xs leading-5 text-brand-muted">
          Speeding tickets, lane change violations, following too close —
          anything on your MVR.
        </p>
        <BucketRow
          name="tickets"
          buckets={TICKET_BUCKETS}
          value={tickets}
          onChange={setTickets}
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-brand-ink">
          In the past 3 years, how many accidents have you been involved in?
        </legend>
        <BucketRow
          name="accidents"
          buckets={ACCIDENT_BUCKETS}
          value={accidents}
          onChange={(v) => {
            setAccidents(v);
            if (bucketToNumber(v) === 0) setAtFault("");
          }}
        />

        {showAtFault ? (
          <div className="mt-5 rounded-lg border border-brand-rule bg-brand-surface p-4">
            <p className="text-sm font-medium text-brand-ink">
              Of those, how many were your fault or preventable?
            </p>
            <BucketRow
              name="atFault"
              buckets={ACCIDENT_BUCKETS}
              value={atFault}
              onChange={setAtFault}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-brand-ink">
          Have you ever had a DUI or DWI?
        </legend>
        <YesNo name="duiEver" value={duiEver} onChange={setDuiEver} />
        {duiEver === "yes" ? (
          <div className="mt-4">
            <label className="block text-sm font-medium text-brand-ink">
              When was the most recent one?
              <span className="ml-2 text-xs font-normal text-brand-muted">
                Month and year is fine.
              </span>
            </label>
            <input
              type="month"
              value={duiDate}
              onChange={(e) => setDuiDate(e.target.value)}
              className="mt-2 h-11 w-full max-w-xs rounded-md border border-brand-rule bg-brand-paper px-3 text-sm text-brand-ink focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30"
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-brand-ink">
          Have you ever been convicted of a felony?
        </legend>
        <YesNo name="felonyEver" value={felonyEver} onChange={setFelonyEver} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!ready}
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-brand-paper shadow-sm transition-colors hover:bg-brand-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          See if I qualify
        </button>
        <span className="text-xs text-brand-muted">
          Carrier requirements vary. We&rsquo;ll check against this
          carrier&rsquo;s and show you what to do next.
        </span>
      </div>
    </form>
  );
}

function BucketRow({
  name,
  buckets,
  value,
  onChange,
}: {
  name: string;
  buckets: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="mt-3 flex flex-wrap gap-2"
    >
      {buckets.map((b) => {
        const selected = value === b;
        return (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(b)}
            className={
              "inline-flex h-11 min-w-12 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors " +
              (selected
                ? "border-brand-deep bg-brand-deep text-brand-paper"
                : "border-brand-rule bg-brand-paper text-brand-ink hover:border-brand-medium")
            }
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}

function YesNo({
  name,
  value,
  onChange,
}: {
  name: string;
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="mt-3 flex gap-2">
      {(["no", "yes"] as const).map((v) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(v)}
            className={
              "inline-flex h-11 min-w-20 items-center justify-center rounded-md border px-5 text-sm font-medium capitalize transition-colors " +
              (selected
                ? "border-brand-deep bg-brand-deep text-brand-paper"
                : "border-brand-rule bg-brand-paper text-brand-ink hover:border-brand-medium")
            }
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
