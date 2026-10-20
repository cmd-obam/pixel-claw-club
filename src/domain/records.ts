export function assertPlayCounts(attemptCount: number, winCount: number): void {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error("attempt_count must be at least 1");
  }
  if (!Number.isInteger(winCount) || winCount < 0 || winCount > attemptCount) {
    throw new Error("win_count must be between 0 and attempt_count");
  }
}

export interface SpendableRecord {
  id: string;
  playerId: string;
  playedAt: string;
  deletedAt: string | null;
  amountSpent: number;
}

export function sumSpending(
  records: SpendableRecord[],
  playerId: string,
  range: { start: Date; end: Date } | null,
  excludeId?: string | null,
): number {
  return records.reduce((total, record) => {
    if (record.playerId !== playerId || record.deletedAt || record.id === excludeId) {
      return total;
    }
    const played = new Date(record.playedAt);
    if (Number.isNaN(played.getTime())) {
      return total;
    }
    if (range && (played < range.start || played >= range.end)) {
      return total;
    }
    return total + record.amountSpent;
  }, 0);
}
