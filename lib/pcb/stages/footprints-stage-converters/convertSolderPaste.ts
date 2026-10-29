import type { PcbSolderPaste } from "circuit-json"
import type { FootprintPad } from "kicadts"
import { createSolderPastePadFromCircuitJson } from "../utils/CreateSolderPastePadFromCircuitJson"

export const convertSolderPaste = ({
  solderPaste,
  componentCenter,
  componentRotation = 0,
}: {
  solderPaste: PcbSolderPaste[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FootprintPad[] =>
  solderPaste.map((aperture) =>
    createSolderPastePadFromCircuitJson({
      solderPaste: aperture,
      componentCenter,
      componentRotation,
    }),
  )
