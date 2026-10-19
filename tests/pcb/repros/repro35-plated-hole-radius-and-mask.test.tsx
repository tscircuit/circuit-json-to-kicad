/**
 * Plated holes drop three pad attributes on PCB export:
 * - `rect_border_radius` on rect-pad plated holes (rounded corners become sharp)
 * - `soldermask_margin` (no `solder_mask_margin` on the pad)
 * - `is_covered_with_solder_mask` (the pad still opens the mask with `*.Mask`)
 *
 * Both component-owned and standalone plated holes are checked, since they
 * reach the pad builder through different stages.
 *
 * To run: bun test tests/pcb/repros/repro35-plated-hole-radius-and-mask.test.tsx
 */
import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson, PcbPlatedHole } from "circuit-json"
import type { FootprintPad } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

let circuitJson: CircuitJson
let componentPads: FootprintPad[]
let standalonePads: FootprintPad[]
let kicadPcbString: string

beforeAll(async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="40mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        pcbX={-10}
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX={-4}
              pcbY={0}
              shape="circular_hole_with_rect_pad"
              holeDiameter="1mm"
              rectPadWidth="3mm"
              rectPadHeight="2mm"
              rectBorderRadius="0.5mm"
            />
            <platedhole
              portHints={["pin2"]}
              pcbX={0}
              pcbY={0}
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
              solderMaskMargin="0.3mm"
            />
            <platedhole
              portHints={["pin3"]}
              pcbX={4}
              pcbY={0}
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
              coveredWithSolderMask
            />
          </footprint>
        }
      />
      <platedhole
        pcbX={6}
        pcbY={0}
        shape="pill_hole_with_rect_pad"
        holeWidth="1mm"
        holeHeight="1.6mm"
        rectPadWidth="2mm"
        rectPadHeight="3mm"
        rectBorderRadius="0.4mm"
      />
      <platedhole
        pcbX={10}
        pcbY={0}
        shape="circle"
        holeDiameter="1mm"
        outerDiameter="2mm"
        solderMaskMargin="0.3mm"
      />
      <platedhole
        pcbX={14}
        pcbY={0}
        shape="circle"
        holeDiameter="1mm"
        outerDiameter="2mm"
        coveredWithSolderMask
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const [componentFootprint, ...standaloneFootprints] =
    converter.getOutput().footprints
  componentPads = componentFootprint!.fpPads
  standalonePads = standaloneFootprints.flatMap((footprint) => footprint.fpPads)
  kicadPcbString = converter.getOutputString()
})

test("repro35: circuit json carries plated hole radius and mask attributes", () => {
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
})

test.failing("repro35: rect_border_radius exports as a roundrect pad", () => {
  // 0.5mm radius on a 3mm x 2mm pad, 0.4mm radius on a 2mm x 3mm pad
  for (const [pad, expectedRatio] of [
    [componentPads[0]!, 0.25],
    [standalonePads[0]!, 0.2],
  ] as const) {
    expect(pad.shape).toBe("roundrect")
    expect(pad.roundrectRatio).toBeCloseTo(expectedRatio)
  }
})

test.failing("repro35: soldermask_margin exports as solder_mask_margin", () => {
  expect(componentPads[1]!.solderMaskMargin).toBe(0.3)
  expect(standalonePads[1]!.solderMaskMargin).toBe(0.3)
})

test.failing("repro35: covered plated holes do not open the solder mask", () => {
  for (const pad of [componentPads[2]!, standalonePads[2]!]) {
    expect(pad.layers?.layers).toEqual(["*.Cu"])
  }
})

test(
  "repro35: plated hole radius and mask board snapshot",
  async () => {
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
