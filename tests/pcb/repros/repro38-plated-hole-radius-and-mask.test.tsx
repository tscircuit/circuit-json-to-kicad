import { expect, test } from "bun:test"
import type { PcbPlatedHole } from "circuit-json"
import { createPlatedHoleRadiusAndMaskRepro } from "../../fixtures/plated-hole-radius-and-mask-repro"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test(
  "repro38: plated hole radius and mask board snapshot",
  async () => {
    const { circuitJson, componentPads, standalonePads, kicadPcbString } =
      await createPlatedHoleRadiusAndMaskRepro()

    // The source attributes exist in Circuit JSON on all 6 plated holes.
    const platedHoles = circuitJson.filter(
      (element): element is PcbPlatedHole => element.type === "pcb_plated_hole",
    )
    expect(platedHoles).toHaveLength(6)
    expect(
      platedHoles.filter((hole) => "rect_border_radius" in hole),
    ).toHaveLength(2)
    expect(
      platedHoles.filter((hole) => hole.soldermask_margin === 0.3),
    ).toHaveLength(2)
    expect(
      platedHoles.filter((hole) => hole.is_covered_with_solder_mask),
    ).toHaveLength(2)
    expect(componentPads).toHaveLength(3)
    expect(standalonePads).toHaveLength(3)

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadPcbString,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
    })
    expect(kicadSnapshot.exitCode).toBe(0)
    expect(
      await stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
