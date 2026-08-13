import { ApiError } from "@/lib/api/errors";

type Bucket = { count: number; resetAt: number };

// Single-instance in-memory limiter (docs/ARCHITECTURE.md §1.2). Survives hot
// reloads via globalThis; resets on process restart, which is acceptable here.
const globalForRl = globalThis as unknown as {
  rlBuckets?: Map<string, Bucket>;
};
const buckets = (globalForRl.rlBuckets ??= new Map());

export function enforceRateLimit(
  key: string,
  { limit = 10, windowMs = 15 * 60_000 } = {},
): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError(
      "rate_limited",
      "Příliš mnoho pokusů. Zkus to znovu později.",
    );
  }
}
