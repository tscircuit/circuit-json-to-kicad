import type { PcbSolderPaste } from "circuit-json"
import { FootprintPad } from "kicadts"
import {
  applyToPoint,
  compose,
  rotateDEG,
  scale,
  translate,
} from "transformation-matrix"
import type { ConverterContext } from "../../../types"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

export function getSolderPasteComponentId(
  paste: PcbSolderPaste,
  ctx: ConverterContext,
): string | undefined {
  const componentId =
    paste.pcb_component_id ??
    (paste.pcb_smtpad_id
      ? ctx.db.pcb_smtpad.get(paste.pcb_smtpad_id)?.pcb_component_id
      : undefined)
  // Preserve orphaned apertures as standalone footprints rather than dropping them.
  return componentId && ctx.db.pcb_component.get(componentId)
    ? componentId
    : undefined
}

/**
 * Convert board-space apertures (mm, +X right, +Y up) into footprint-local
 * KiCad pad positions (mm, +X right, +Y down). Positions are points, so they
 * receive the component translation. Pad angles remain board-space CCW angles,
 * as required by KiCad's footprint pad format.
 */
export function convertSolderPastes({
  solderPastes,
  componentCenter,
  componentRotation = 0,
}: {
  solderPastes: PcbSolderPaste[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FootprintPad[] {
  // Same board-to-footprint expression as createSmdPadFromCircuitJson.
  const boardToFootprint = compose(
    rotateDEG(componentRotation),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  return solderPastes.map((paste) => {
    const position = applyToPoint(boardToFootprint, paste)
    const size: [number, number] =
      paste.shape === "circle"
        ? [paste.radius * 2, paste.radius * 2]
        : [paste.width, paste.height]
    const isPill = paste.shape === "pill" || paste.shape === "rotated_pill"
    const shape =
      paste.shape === "circle"
        ? "circle"
        : paste.shape === "oval"
          ? "oval"
          : isPill
            ? "roundrect"
            : "rect"

    return new FootprintPad({
      number: "",
      padType: "smd",
      shape,
      at: [
        position.x,
        position.y,
        "ccw_rotation" in paste ? paste.ccw_rotation : 0,
      ],
      size,
      layers: [paste.layer === "bottom" ? "B.Paste" : "F.Paste"],
      roundrectRatio: isPill
        ? paste.radius / Math.min(paste.width, paste.height)
        : undefined,
      uuid: generateDeterministicUuid(
        `solder_paste:${paste.pcb_solder_paste_id}`,
      ),
    })
  })
}
