// Named-company blocklist for the content machine. Per the Daily
// Article Prompt §4 rule: "Critique the model, not a named company's
// character." A *verifiable factual statement* about a named company is
// allowed; an *unverified accusation* is not. Since the machine
// auto-publishes, the cheapest guarantee is to disallow the names
// entirely — owner adds anything they want to keep out of bodies here.
//
// Matching is case-insensitive whole-word (so "indeed" matches the
// company but not "we indeed verified..."). See validate.ts.
//
// Leave the array empty unless you want a specific name blocked.
export const BLOCKED_TERMS: string[] = [];
