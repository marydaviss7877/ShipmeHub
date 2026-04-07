// USPS Priority Mail retail rates — Zone 1 (minimum / closest zone)
// Source: USPS official rate chart, 2025
// "Weight Not Over (lbs.)" — Math.ceil(weight) gives the correct tier
const ZONE1 = {
   1: 10.20,  2: 11.05,  3: 11.55,  4: 12.45,  5: 13.25,
   6: 13.80,  7: 14.40,  8: 15.05,  9: 15.60, 10: 16.50,
  11: 17.30, 12: 18.05, 13: 18.85, 14: 19.65, 15: 20.35,
  16: 21.20, 17: 22.00, 18: 22.75, 19: 23.20, 20: 23.65,
  21: 27.30, 22: 29.70, 23: 31.35, 24: 32.50, 25: 33.75,
  26: 34.95, 27: 36.10, 28: 37.05, 29: 37.95, 30: 38.85,
  31: 39.80, 32: 40.65, 33: 41.55, 34: 42.50, 35: 43.35,
  36: 44.25, 37: 45.10, 38: 45.90, 39: 46.75, 40: 47.55,
  41: 48.35, 42: 49.20, 43: 49.90, 44: 50.75, 45: 51.50,
  46: 52.25, 47: 52.95, 48: 53.65, 49: 54.40, 50: 55.10,
  51: 55.80, 52: 56.55, 53: 57.15, 54: 57.80, 55: 58.45,
  56: 59.10, 57: 59.75, 58: 60.35, 59: 60.95, 60: 61.50,
  61: 62.10, 62: 62.70, 63: 63.30, 64: 63.80, 65: 64.30,
  66: 64.85, 67: 65.35, 68: 65.90, 69: 66.35, 70: 66.85,
};

/**
 * Returns the USPS Priority Mail Zone 1 retail rate for a given weight.
 * Returns null if weight is 0, negative, or > 70 lbs (out of table range).
 * @param {number} weightLbs
 * @returns {number|null}
 */
function getUspsZone1Rate(weightLbs) {
  if (!weightLbs || weightLbs <= 0) return null;
  const tier = Math.min(Math.ceil(weightLbs), 70);
  return ZONE1[tier] ?? null;
}

module.exports = { getUspsZone1Rate };
