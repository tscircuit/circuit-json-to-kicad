import type { Footprint } from "kicadts"

/**
 * KiCad's footprint type, taken from the pads the footprint actually has: any
 * plated through-hole pad makes it through_hole, otherwise SMD pads make it
 * smd.
 *
 * A footprint with neither - a mounting hole, whose only pad is np_thru_hole -
 * is left unspecified, as KiCad's own MountingHole footprints are. An
 * unplated hole is not something you solder, so it does not make an otherwise
 * SMD part through-hole; KiCad's own "footprint type doesn't match pads" check
 * only counts plated pads for the same reason.
 */
export function getFootprintTypeFromPads(
  footprint: Footprint,
): "through_hole" | "smd" | undefined {
  const padTypes = new Set(footprint.fpPads?.map((pad) => pad.padType))
  if (padTypes.has("thru_hole")) return "through_hole"
  if (padTypes.has("smd")) return "smd"
  return undefined
}
