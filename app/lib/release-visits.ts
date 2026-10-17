/** Invalid or future persisted boundaries are treated as an unreviewed first visit. */
export function validVisitTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Date.now()
    ? value
    : null
}

export function isNewRelease(publishedAt: string, lastReviewedAt: number | null): boolean {
  return lastReviewedAt !== null && Date.parse(publishedAt) > lastReviewedAt
}
