/**
 * Stage registry: the run plays STAGES[0] → STAGES[1] → … in order.
 * To add / replace a stage, import its def here and put it in the list (docs/ADDING_A_STAGE.md).
 */
import { hasEnemyKind, hasFormation } from '../enemies/registry';
import { STAGE2_PLACEHOLDER, STAGE3_PLACEHOLDER } from './placeholders';
import { STAGE1 } from './stage1';
import type { StageDef, StageEvent } from './types';

export const STAGES: readonly StageDef[] = [STAGE1, STAGE2_PLACEHOLDER, STAGE3_PLACEHOLDER];

/** 1-based lookup, clamped to the registered range. */
export function getStage(n: number): StageDef {
  const i = Math.max(1, Math.min(STAGES.length, Math.round(n) || 1)) - 1;
  return STAGES[i];
}

export function stageCount(): number {
  return STAGES.length;
}

/** Time of the first event of a type (debug skips), or -1. */
export function eventTime(def: StageDef, type: StageEvent['type']): number {
  const e = def.events.find((x) => x.type === type);
  return e ? e.t : -1;
}

/** Dev-only sanity check of every def (unknown kinds / formations, unsorted or missing boss). */
export function validateStages(): string[] {
  const errs: string[] = [];
  for (const s of STAGES) {
    let last = -Infinity;
    let boss = 0;
    for (const e of s.events) {
      if (e.t < last) errs.push(`${s.id}: event at ${e.t}s is out of order`);
      last = e.t;
      if (e.type === 'boss') boss++;
      if (e.type === 'wave') {
        if (!hasEnemyKind(e.kind)) errs.push(`${s.id}: unknown enemy kind "${e.kind}" at ${e.t}s`);
        if (!hasFormation(e.formation)) errs.push(`${s.id}: unknown formation "${e.formation}" at ${e.t}s`);
        if (!s.enemyKinds.includes(e.kind)) errs.push(`${s.id}: kind "${e.kind}" missing from enemyKinds`);
      }
      if (e.type === 'intro' && e.kind && !hasEnemyKind(e.kind)) errs.push(`${s.id}: unknown intro kind "${e.kind}"`);
    }
    if (boss !== 1) errs.push(`${s.id}: needs exactly one 'boss' event (has ${boss})`);
    if (s.events.some((e) => e.type === 'midboss') && !s.midBoss) errs.push(`${s.id}: 'midboss' event but no midBoss slot`);
  }
  return errs;
}

export type { StageDef } from './types';
