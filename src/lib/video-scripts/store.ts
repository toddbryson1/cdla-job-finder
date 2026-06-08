// Persistence for generated video scripts (schema.ts videoScripts,
// migration 0035). The generator CLI upserts rendered scripts here so the
// team can track which scripts exist and which have been produced into
// video. See docs/CDLAjobs_Video_Script_Template.docx §14.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { funnelEvents, videoScripts } from "@/db/schema";
import type { RenderedScript } from "./index";

export type VideoScriptStatus =
  | "generated"
  | "in_production"
  | "published"
  | "archived";

/**
 * Upsert a rendered script on (slug, templateKey). Refreshes the body,
 * variable snapshot, and warnings (pay numbers drift between runs) but
 * PRESERVES status + producedVideoUrl — re-generating never undoes an
 * operator marking a script produced. Returns the row id.
 */
export async function saveGeneratedScript(
  script: RenderedScript,
): Promise<string> {
  const rows = await db
    .insert(videoScripts)
    .values({
      slug: script.slug,
      region: script.region,
      equipment: script.equipment,
      templateKey: script.templateKey,
      body: script.body,
      variables: script.variables,
      warnings: script.warnings,
    })
    .onConflictDoUpdate({
      target: [videoScripts.slug, videoScripts.templateKey],
      set: {
        region: script.region,
        equipment: script.equipment,
        body: script.body,
        variables: script.variables,
        warnings: script.warnings,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: videoScripts.id });
  return rows[0]!.id;
}

export interface VideoScriptListFilter {
  status?: VideoScriptStatus;
  slug?: string;
}

/** List stored scripts, newest first. Optionally filter by status/slug. */
export async function listVideoScripts(filter: VideoScriptListFilter = {}) {
  const conds = [];
  if (filter.status) conds.push(eq(videoScripts.status, filter.status));
  if (filter.slug) conds.push(eq(videoScripts.slug, filter.slug));
  return db
    .select({
      id: videoScripts.id,
      slug: videoScripts.slug,
      templateKey: videoScripts.templateKey,
      status: videoScripts.status,
      producedVideoUrl: videoScripts.producedVideoUrl,
      generatedAt: videoScripts.generatedAt,
      updatedAt: videoScripts.updatedAt,
    })
    .from(videoScripts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(videoScripts.updatedAt));
}

/**
 * Update a script's production status. Pass producedVideoUrl when moving
 * to "published". Returns true if a row was updated.
 */
export async function markVideoScriptStatus(
  id: string,
  status: VideoScriptStatus,
  producedVideoUrl?: string | null,
): Promise<boolean> {
  const set: {
    status: VideoScriptStatus;
    updatedAt: Date;
    producedVideoUrl?: string | null;
  } = { status, updatedAt: new Date() };
  if (producedVideoUrl !== undefined) set.producedVideoUrl = producedVideoUrl;
  const rows = await db
    .update(videoScripts)
    .set(set)
    .where(eq(videoScripts.id, id))
    .returning({ id: videoScripts.id });
  return rows.length > 0;
}

export interface VideoScriptConversion {
  slug: string;
  templateKey: string;
  status: string;
  /** Distinct drivers who completed intake after a click on this script. */
  intakes: number;
}

/**
 * Per-script intake conversions (docs §14). Joins each tracked script to
 * intake_completed funnel events tagged with its vsrc (<slug>__<template>,
 * captured first-touch by the proxy). Counts DISTINCT drivers so re-submits
 * don't inflate. Ordered most-converting first. Scripts with zero intakes
 * are included (intakes = 0).
 */
export async function videoScriptConversions(): Promise<
  VideoScriptConversion[]
> {
  const rows = (await db.execute(sql`
    SELECT
      vs.slug AS slug,
      vs.template_key AS template_key,
      vs.status AS status,
      COUNT(DISTINCT fe.driver_id)::int AS intakes
    FROM ${videoScripts} vs
    LEFT JOIN ${funnelEvents} fe
      ON fe.event_type = 'intake_completed'
     AND fe.metadata->>'vsrc' = vs.slug || '__' || vs.template_key
    GROUP BY vs.slug, vs.template_key, vs.status
    ORDER BY intakes DESC, vs.slug, vs.template_key
  `)) as unknown as Array<{
    slug: string;
    template_key: string;
    status: string;
    intakes: number;
  }>;
  return rows.map((r) => ({
    slug: r.slug,
    templateKey: r.template_key,
    status: r.status,
    intakes: r.intakes,
  }));
}
