import { findPath, isWalkable, VILLAGE_COLS, VILLAGE_ROWS } from "@/domain/village";

export type Direction = "up" | "down" | "left" | "right";
export type CharacterAnimState = "walk" | "idle" | "sleep";

export interface SimCharacter {
  id: string;
  prizeId: string;
  ownerMemberId: string;
  name: string;
  col: number;
  row: number;
  dir: Direction;
  state: CharacterAnimState;
  path: Array<{ col: number; row: number }>;
  timer: number;
  bob: number;
}

export interface SimulationSeed {
  id: string;
  prizeId: string;
  ownerMemberId: string;
  name: string;
  col: number;
  row: number;
}

export interface SimulationOptions {
  blocked: ReadonlySet<string>;
  random?: () => number;
}

const STEP_MS = 420;
const IDLE_MS = 900;

function directionBetween(
  from: { col: number; row: number },
  to: { col: number; row: number },
): Direction {
  if (to.col > from.col) {
    return "right";
  }
  if (to.col < from.col) {
    return "left";
  }
  if (to.row > from.row) {
    return "down";
  }
  return "up";
}

export class VillageSimulation {
  readonly characters: SimCharacter[];
  private disposed = false;
  private readonly blocked: ReadonlySet<string>;
  private readonly random: () => number;

  constructor(seeds: SimulationSeed[], options: SimulationOptions) {
    const seen = new Set<string>();
    this.blocked = options.blocked;
    this.random = options.random ?? Math.random;
    this.characters = [];
    for (const seed of seeds) {
      if (seen.has(seed.prizeId)) {
        continue;
      }
      seen.add(seed.prizeId);
      const col = isWalkable(seed.col, seed.row, this.blocked) ? seed.col : 0;
      const row = isWalkable(seed.col, seed.row, this.blocked) ? seed.row : 0;
      this.characters.push({
        id: seed.id,
        prizeId: seed.prizeId,
        ownerMemberId: seed.ownerMemberId,
        name: seed.name,
        col,
        row,
        dir: "down",
        state: "idle",
        path: [],
        timer: IDLE_MS,
        bob: 0,
      });
    }
  }

  get disposedFlag(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.characters.splice(0, this.characters.length);
  }

  step(dt: number): void {
    if (this.disposed || dt < 0) {
      return;
    }
    for (const character of this.characters) {
      character.timer -= dt;
      character.bob += dt;
      if (character.timer > 0) {
        continue;
      }
      if (character.state === "sleep") {
        character.state = "idle";
        character.timer = IDLE_MS;
        continue;
      }
      if (character.path.length === 0) {
        this.chooseNext(character);
        continue;
      }
      const next = character.path[0];
      if (!next || !isWalkable(next.col, next.row, this.blocked)) {
        character.path = [];
        character.state = "idle";
        character.timer = IDLE_MS;
        continue;
      }
      character.dir = directionBetween(character, next);
      character.col = next.col;
      character.row = next.row;
      character.path.shift();
      character.state = "walk";
      character.timer = STEP_MS;
    }
  }

  private chooseNext(character: SimCharacter): void {
    const roll = this.random();
    if (roll < 0.12) {
      character.state = "sleep";
      character.timer = 1600;
      return;
    }
    if (roll < 0.4) {
      character.state = "idle";
      character.timer = IDLE_MS + Math.floor(this.random() * 600);
      return;
    }
    const target = this.randomWalkable();
    if (!target) {
      character.state = "idle";
      character.timer = IDLE_MS;
      return;
    }
    const path = findPath(character, target, this.blocked);
    character.path = path ?? [];
    character.state = character.path.length > 0 ? "walk" : "idle";
    character.timer = character.path.length > 0 ? STEP_MS : IDLE_MS;
  }

  private randomWalkable(): { col: number; row: number } | null {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const col = Math.floor(this.random() * VILLAGE_COLS);
      const row = Math.floor(this.random() * VILLAGE_ROWS);
      if (isWalkable(col, row, this.blocked)) {
        return { col, row };
      }
    }
    return null;
  }
}
