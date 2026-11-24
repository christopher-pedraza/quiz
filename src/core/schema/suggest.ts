/** Levenshtein distance, small inputs only. */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** The candidate closest to `word`, if it is close enough to be a plausible typo. */
export function didYouMean(word: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const c of candidates) {
    const d = distance(word.toLowerCase(), c.toLowerCase())
    if (d < bestD) [best, bestD] = [c, d]
  }
  return best !== undefined && bestD <= Math.max(2, Math.floor(best.length / 3)) ? best : undefined
}
