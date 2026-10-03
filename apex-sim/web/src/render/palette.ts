// Colour decisions for the physics debug view (§20: 응력 색 — 압축 파랑, 인장 빨강) and the design tokens of §18.2.
export const TOKENS = {
  background: 0x0b0d10,
  surface: 0x14171c,
  surfaceRaised: 0x1c2027,
  text: 0xf2f4f7,
  accent: 0xff6b2c,
  tension: [0.957, 0.278, 0.361] as const, // #F4475C (danger)
  compression: [0.239, 0.545, 1.0] as const, // #3D8BFF (electric blue)
  neutralBeam: [0.52, 0.56, 0.63] as const,
};

/** Strain at which a beam is drawn fully tension-red / compression-blue [-] (steel yields around 0.2 %, our
 *  lattices are softer; 2 % keeps elastic flexing visible without saturating everything). */
export const STRAIN_FULL_SCALE = 0.02;

/** Writes the RGB colour of a beam with the given strain into out[o..o+2]. NaN strain (broken) → returns false. */
export function strainColor(strain: number, out: Float32Array, o: number): boolean {
  if (Number.isNaN(strain)) return false;
  const s = Math.max(-1, Math.min(1, strain / STRAIN_FULL_SCALE));
  const t = Math.pow(Math.abs(s), 0.6); // perceptual boost for small strains
  const target = s >= 0 ? TOKENS.tension : TOKENS.compression;
  const n = TOKENS.neutralBeam;
  out[o] = n[0] + (target[0] - n[0]) * t;
  out[o + 1] = n[1] + (target[1] - n[1]) * t;
  out[o + 2] = n[2] + (target[2] - n[2]) * t;
  return true;
}

/** Distinct, calm body tints for node spheres (cycled). */
export const BODY_TINTS = [0xd9dee7, 0xffc9a8, 0xb9d3ff, 0xbdf2dc, 0xf4d58d, 0xe2c6ff, 0xffb3bf, 0xc8f0ff];
