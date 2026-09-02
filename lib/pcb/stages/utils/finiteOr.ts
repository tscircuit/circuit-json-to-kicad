/**
 * Returns `value` when it is a usable number, otherwise `fallback`.
 *
 * `value ?? fallback` is not sufficient for dimensions coming from Circuit JSON:
 * an unparseable user value (e.g. `holeDiameter="abc"`) reaches the converter as
 * `NaN`, which is neither `null` nor `undefined` and therefore passes straight
 * through `??`. Writing it into a KiCad file produces tokens like `(drill NaN)`
 * or `(size NaN NaN)`, which KiCad refuses to parse — so the whole board fails to
 * open rather than one hole merely looking wrong.
 */
export const finiteOr = (
  value: number | null | undefined,
  fallback: number,
  label?: string,
): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "number" && label) {
    // Only warn for NaN/Infinity, which means a real value was computed and lost.
    // A plain null/undefined is the ordinary "not specified" case.
    console.warn(
      `${label} is ${value}; writing ${fallback} instead. A non-finite dimension would emit an unparseable KiCad file.`,
    )
  }
  return fallback
}
