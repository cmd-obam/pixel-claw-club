export interface VillageLevelRule {
  level: number;
  min: number;
  max: number | null;
  name: string;
}

export const VILLAGE_LEVELS: readonly VillageLevelRule[] = [
  { level: 1, min: 0, max: 4, name: "풀밭 마을" },
  { level: 2, min: 5, max: 14, name: "꽃과 나무" },
  { level: 3, min: 15, max: 29, name: "작은 집" },
  { level: 4, min: 30, max: 49, name: "연못 마을" },
  { level: 5, min: 50, max: null, name: "넓은 마을" },
];

export const VILLAGE_COLS = 16;
export const VILLAGE_ROWS = 11;

export function villageLevelForCount(count: number): VillageLevelRule {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("prize count must be a non-negative integer");
  }
  const match = VILLAGE_LEVELS.find(
    (rule) => count >= rule.min && (rule.max === null || count <= rule.max),
  );
  if (!match) {
    throw new Error("village level is not configured");
  }
  return match;
}

export function mergeUnlockedLevel(previous: number, current: number): number {
  return Math.max(previous, current);
}

export interface VillagePrizeRef {
  id: string;
  visibility: "PRIVATE" | "GROUP";
  deletedAt: string | null;
}

export function eligibleVillagePrizes<T extends VillagePrizeRef>(prizes: T[]): T[] {
  return prizes.filter((prize) => prize.deletedAt === null && prize.visibility === "GROUP");
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function blockRect(
  blocked: Set<string>,
  col: number,
  row: number,
  width: number,
  height: number,
): void {
  for (let y = row; y < row + height; y += 1) {
    for (let x = col; x < col + width; x += 1) {
      blocked.add(tileKey(x, y));
    }
  }
}

/** Obstacles follow unlocked decorations that remain on the map. */
export function blockedTilesForLevel(level: number): Set<string> {
  const blocked = new Set<string>();
  if (level >= 3) {
    blockRect(blocked, 2, 2, 3, 2);
  }
  if (level >= 4) {
    blockRect(blocked, 11, 6, 4, 3);
  }
  if (level >= 5) {
    blockRect(blocked, 7, 1, 2, 2);
  }
  return blocked;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < VILLAGE_COLS && row < VILLAGE_ROWS;
}

export function isWalkable(col: number, row: number, blocked: ReadonlySet<string>): boolean {
  return inBounds(col, row) && !blocked.has(tileKey(col, row));
}

export interface GridPoint {
  col: number;
  row: number;
}

const NEIGHBORS: GridPoint[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

export function findPath(
  from: GridPoint,
  to: GridPoint,
  blocked: ReadonlySet<string>,
): GridPoint[] | null {
  if (!isWalkable(to.col, to.row, blocked) || !isWalkable(from.col, from.row, blocked)) {
    return null;
  }
  if (from.col === to.col && from.row === to.row) {
    return [];
  }
  const queue: GridPoint[] = [from];
  const previous = new Map<string, string | null>();
  previous.set(tileKey(from.col, from.row), null);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const step of NEIGHBORS) {
      const next = { col: current.col + step.col, row: current.row + step.row };
      const key = tileKey(next.col, next.row);
      if (previous.has(key) || !isWalkable(next.col, next.row, blocked)) {
        continue;
      }
      previous.set(key, tileKey(current.col, current.row));
      if (next.col === to.col && next.row === to.row) {
        const path: GridPoint[] = [next];
        let cursor: string | null = tileKey(current.col, current.row);
        while (cursor && cursor !== tileKey(from.col, from.row)) {
          const [col, row] = cursor.split(",").map(Number);
          path.push({ col: col ?? 0, row: row ?? 0 });
          cursor = previous.get(cursor) ?? null;
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function resolveSpriteKind(input: {
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  hasPixel: boolean;
}): "pixel" | "placeholder" {
  if (input.processingStatus === "SUCCEEDED" && input.hasPixel) {
    return "pixel";
  }
  return "placeholder";
}

export function uniqueByPrizeId<T extends { prizeId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.prizeId)) {
      continue;
    }
    seen.add(item.prizeId);
    unique.push(item);
  }
  return unique;
}
