// MA Opportunity Finder: tiering, members to move, and dollars at stake.
// Pure functions, no DOM. Contracts come from data/ma_opportunities.json.

export const MEASURE_KEYS = ['dm', 'ras', 'statin', 'cbp', 'spc', 'supd'];
export const SHARE_KEY = { dm: 'shareDm', ras: 'shareRas', statin: 'shareStatin', cbp: 'shareCbp', spc: 'shareSpc', supd: 'shareSupd' };

const within = (v, t) => v !== null && v !== undefined && v <= t;

// Measures within `t` points of the next star (gapUp) or of dropping (cushion).
export function nearMeasures(c, t, keys = MEASURE_KEYS) {
  return {
    up: keys.filter((k) => within(c.measures[k]?.gapUp, t)),
    down: keys.filter((k) => within(c.measures[k]?.cushion, t)),
  };
}

/**
 * Exactly one tier, or null:
 *   1 "Bonus cliff":      overall 3.5 and a target measure within t of the next star
 *   2 "Defend the bonus": overall 4.0 and a target measure within t of dropping a star
 *   3 "Measure lift":     anything else with a target measure within t of the next star
 */
export function tierFor(c, t, keys = MEASURE_KEYS) {
  const { up, down } = nearMeasures(c, t, keys);
  if (c.overall === 3.5 && up.length) return 1;
  if (c.overall === 4 && down.length) return 2;
  return up.length ? 3 : null;
}

// Rough members whose result must change: enrollment x denominator share x gap.
// Tier 2 counts the cushion (members who could slip) on at-risk measures.
export function membersToMove(c, t, shares, keys = MEASURE_KEYS) {
  if (!c.enrollment) return null;
  const tier = tierFor(c, t, keys);
  if (!tier) return 0;
  const { up, down } = nearMeasures(c, t, keys);
  const use = tier === 2 ? down : up;
  const field = tier === 2 ? 'cushion' : 'gapUp';
  return use.reduce((sum, k) => sum + c.enrollment * (shares[SHARE_KEY[k]] ?? 0) * Math.max(c.measures[k][field], 0.5) / 100, 0);
}

// Illustrative bonus at stake for Tier 1 (could gain) and Tier 2 (could lose).
export function dollarsAtStake(c, t, { benchmarkPMPM, qbpPct }, keys = MEASURE_KEYS) {
  const tier = tierFor(c, t, keys);
  if ((tier !== 1 && tier !== 2) || !c.enrollment) return null;
  return c.enrollment * benchmarkPMPM * 12 * qbpPct;
}

// Compact cell text for one measure.
export function measureLabel(m) {
  if (!m || m.rate === null) return null;
  if (m.stars === 5) return { main: `${m.rate}%`, stars: 5, note: 'top star' };
  return { main: `${m.rate}%`, stars: m.stars, note: m.gapUp !== null ? `+${m.gapUp.toFixed(1)} to ★${m.stars + 1}` : '' , cushion: m.cushion };
}
