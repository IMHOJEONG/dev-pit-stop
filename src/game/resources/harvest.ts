import { HARVEST_COOLDOWN, HARVEST_RULES } from './catalog';
import type { Resource } from './catalog';

export interface HarvestHit {
  resource: Resource;
  hits: number;
  finishing: boolean;
}
export interface HarvestCompletion {
  resource: Resource;
  reward: number;
}

/** Completes deposits once; their rewards become world drops before pickup. */
export class HarvestSystem {
  private progress = new Map<number, number>();
  private pending = new Map<number, number>();
  private cooldown = 0;
  private byId: Map<number, Resource>;
  constructor(
    resources: Resource[],
    private collected: Set<number>,
  ) {
    this.byId = new Map(resources.map((r) => [r.id, r]));
  }

  hits(id: number) {
    return this.progress.get(id) ?? 0;
  }
  isFinishing(id: number) {
    return this.pending.has(id);
  }
  hit(id: number): HarvestHit | null {
    const resource = this.byId.get(id);
    if (!resource || this.cooldown > 0 || this.collected.has(id) || this.pending.has(id))
      return null;
    const rule = HARVEST_RULES[resource.kind];
    const hits = Math.min(rule.hits, this.hits(id) + 1);
    this.progress.set(id, hits);
    this.cooldown = HARVEST_COOLDOWN;
    const finishing = hits === rule.hits;
    if (finishing) this.pending.set(id, rule.duration);
    return { resource, hits, finishing };
  }
  advance(dt: number): HarvestCompletion[] {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    this.cooldown = Math.max(0, this.cooldown - dt);
    const completed: HarvestCompletion[] = [];
    for (const [id, remaining] of this.pending) {
      const next = remaining - dt;
      if (next > 0.000001) {
        this.pending.set(id, next);
        continue;
      }
      const resource = this.byId.get(id)!;
      if (!this.collected.has(id)) {
        this.collected.add(id);
        completed.push({ resource, reward: 1 });
      }
      this.pending.delete(id);
      this.progress.delete(id);
    }
    return completed;
  }
  snapshot(): [number, number][] {
    // An interrupted finishing animation resumes at the final hit, before any reward.
    return [...this.progress].map(([id, hits]) => [
      id,
      Math.min(hits, HARVEST_RULES[this.byId.get(id)!.kind].hits - 1),
    ]);
  }
  restore(entries: [number, number][] = []) {
    this.reset();
    for (const [id, hits] of entries) {
      const resource = this.byId.get(id);
      if (
        resource &&
        !this.collected.has(id) &&
        Number.isInteger(hits) &&
        hits > 0 &&
        hits < HARVEST_RULES[resource.kind].hits
      )
        this.progress.set(id, hits);
    }
  }
  reset() {
    this.progress.clear();
    this.pending.clear();
    this.cooldown = 0;
  }
}
