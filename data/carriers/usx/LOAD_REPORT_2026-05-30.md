# U.S. Xpress Load Report — 2026-05-30

Generated 2026-06-01T03:03:58.618Z (COMMIT mode).

## 1. Carriers row

- name: `U.S. Xpress`
- kind: `partner`
- tier: `none`
- status: `paused`  ← do not flip without audit
- public_careers_url: `https://www.usxpress.com/drivers`
- legal_name: `null` — Todd to provide
- fmcsa_dot_number / fmcsa_mc_number: `null` — Todd to provide
- tenstreet_account_id: `null`

## 2. Carrier_jobs counts

- Total prepared: 85
- Polygon-matched: 85
- Polygon-missing (fell back to centroid only): 0

## 3. Per-field null counts

- domicile_city: 0
- domicile_state: 71
- hiring_polygon: 0
- weekly_pay_min: 67
- weekly_pay_max: 67
- sign_on_bonus: 24

## 4. Equipment breakdown

- dry-van: 85

## 5. Data-quality breakdown

- complete: 3
- partial: 82
- minimal: 0

## 6. Polygon mismatches (no KML polygon for CSV row)

None.

## 7. Unparseable domiciles (truly broken)

None.

## 7b. Missing state (city parsed, state resolved at commit time via nearest-zip lookup)

The writer reverse-geocodes polygon centroid → nearest zip → state for these 71 rows.

- USX-0002: Family Dollar Front Royal
- USX-0003: Family Dollar Front Royal
- USX-0005: Family Dollar Morehead
- USX-0006: DT Windsor
- USX-0007: DT Savannah
- USX-0008: FD Maquoketa
- USX-0009: FD Ashley
- USX-0011: FD Marianna
- USX-0013: Tractor Supply Frankfort
- USX-0014: TSC Colonie
- USX-0015: Whirlpool Bridgeton
- USX-0017: Family Dollar Front Royal
- USX-0018: Staples Terre Haute
- USX-0019: Staples Terre Haute
- USX-0020: FD Ashley
- USX-0022: Target Denton
- USX-0023: Target Denton
- USX-0024: Target Denton
- USX-0026: Meijer
- USX-0030: Kroger Blue Ash
- USX-0032: Staples Terre Haute
- USX-0033: CHICAGO USX Terminal
- USX-0035: Dallas
- USX-0037: Memphis TN (MTN)
- USX-0038: ELLENWOOD BASED
- USX-0039: Jacksonville
- USX-0040: Phoenix
- USX-0041: Phoenix
- USX-0042: TUNNEL HILL
- USX-0043: Dallas
- USX-0044: CHICAGO USX Terminal
- USX-0045: TUNNEL HILL
- USX-0046: SPRINGFIELD
- USX-0047: Phoenix
- USX-0048: Closest Terminal
- USX-0049: closest Terminal
- USX-0050: SHIPPENSBURG
- USX-0051: CHICAGO USX Terminal
- USX-0052: Springfield USX Terminal
- USX-0053: Phoenix
- USX-0054: Dallas
- USX-0055: Dallas
- USX-0056: Springfield USX Terminal
- USX-0057: Springfield USX Terminal
- USX-0058: Springfield USX Terminal
- USX-0059: SHIPPENSBURG
- USX-0060: DUNCAN
- USX-0061: Jacksonville
- USX-0062: Duncan USX Terminal
- USX-0063: Springfield USX Terminal
- USX-0064: Springfield USX Terminal
- USX-0065: DT Warrensburg
- USX-0066: FD Front Royal ORIENTATION SITE: Closest Site (NO DALLAS) Updated 3.10.25
- USX-0067: Walmart Gordonsville
- USX-0068: TARGET NEWTON LEASE PURCHASE-Home weekly. 75 miles from Newton NC. Must have 6 months experience in the last 3 years. LP'S DO NOT RECEIVE ORIENTATION PAY.
- USX-0069: FD Marianna
- USX-0070: Dollar Tree Savannah
- USX-0071: DT Joliet
- USX-0072: FD Ashley
- USX-0074: Family Dollar Morehead
- USX-0075: Whirlpool Bridgeton
- USX-0076: FD Maquoketa
- USX-0077: Walmart Henderson
- USX-0078: Target Denton
- USX-0079: Target Denton
- USX-0080: Target Denton
- USX-0081: Springfield
- USX-0082: Springfield
- USX-0083: Phoenix
- USX-0084: Chicago
- USX-0085: Chicago

## 8. Low-confidence equipment (Specialized Fleets fallback to dry-van)

- USX-0054
- USX-0055
- USX-0056
- USX-0057
- USX-0058
- USX-0059
- USX-0060
- USX-0061
- USX-0062
- USX-0063
- USX-0064

## 9. Suspected duplicates (same domicile_raw + >70% description similarity)

These pairs may represent the same physical job posted under two home-time categories.
Per the build prompt we keep all rows; manual cleanup happens during audit.

- usx:csv:USX-0009  ↔  usx:csv:USX-0020  (ratio 1)
- usx:csv:USX-0018  ↔  usx:csv:USX-0019  (ratio 0.872)
- usx:csv:USX-0018  ↔  usx:csv:USX-0032  (ratio 0.876)
- usx:csv:USX-0019  ↔  usx:csv:USX-0032  (ratio 0.985)
- usx:csv:USX-0022  ↔  usx:csv:USX-0023  (ratio 1)
- usx:csv:USX-0022  ↔  usx:csv:USX-0024  (ratio 0.868)
- usx:csv:USX-0022  ↔  usx:csv:USX-0078  (ratio 0.868)
- usx:csv:USX-0022  ↔  usx:csv:USX-0079  (ratio 0.868)
- usx:csv:USX-0022  ↔  usx:csv:USX-0080  (ratio 0.868)
- usx:csv:USX-0023  ↔  usx:csv:USX-0024  (ratio 0.868)
- usx:csv:USX-0023  ↔  usx:csv:USX-0078  (ratio 0.868)
- usx:csv:USX-0023  ↔  usx:csv:USX-0079  (ratio 0.868)
- usx:csv:USX-0023  ↔  usx:csv:USX-0080  (ratio 0.868)
- usx:csv:USX-0024  ↔  usx:csv:USX-0078  (ratio 1)
- usx:csv:USX-0024  ↔  usx:csv:USX-0079  (ratio 1)
- usx:csv:USX-0024  ↔  usx:csv:USX-0080  (ratio 1)
- usx:csv:USX-0040  ↔  usx:csv:USX-0041  (ratio 1)
- usx:csv:USX-0056  ↔  usx:csv:USX-0057  (ratio 1)
- usx:csv:USX-0078  ↔  usx:csv:USX-0079  (ratio 1)
- usx:csv:USX-0078  ↔  usx:csv:USX-0080  (ratio 1)
- usx:csv:USX-0079  ↔  usx:csv:USX-0080  (ratio 1)
- usx:csv:USX-0084  ↔  usx:csv:USX-0085  (ratio 1)

## 10. Critical-null rows (no description OR no lat/lng AND no polygon)

None.

## 11. Decisions made that weren't fully specified

- KML parsing: regex-based extraction (no XML library dep). KML is well-formed enough.
- Dedup similarity: hand-rolled trigram ratio at 0.70 threshold (no external lib).
- Equipment heuristic for Specialized Fleets: title/description scan for flatbed/reefer/tanker keywords; fall back to `dry-van` with `confidence: low` flag (see §8).
- domicile_state when ambiguous (e.g. `DUNCAN`, `Chicago Based`): null + flag in §7.
- Idempotency: external_source_id = `usx:csv:USX-NNNN`, ON CONFLICT DO UPDATE.
- Carrier ships PAUSED — do not flip to active without audit session.

## 12. Follow-ups before flipping to active

- Todd: confirm `legal_name`, `fmcsa_dot_number`, `fmcsa_mc_number`.
- Todd: review suspected duplicates in §9 and merge or accept.
- Todd: confirm Specialized Fleets equipment (§8) — some may be flatbed/reefer/tanker even when keyword detection fell back to dry-van.
- Todd: review unparseable domiciles in §7 — fill in city/state manually before publishing.
- Todd: review polygon-missing rows in §6 — without polygon and with `hiring_radius_miles = null`, those jobs only match OTR drivers; may need radius backfill if the carrier expects non-OTR matches.
