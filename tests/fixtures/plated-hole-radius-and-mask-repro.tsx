import type { CircuitJson } from "circuit-json"
import type { FootprintPad } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * Plated holes with rounded rect pads, a solder mask margin and a covered
 * (tented) mask, inside U1's footprint and directly on the board. The two
 * reach the pad builder through different stages, so both are exported.
 * Pads are ordered: [0] rect_border_radius, [1] soldermask_margin,
 * [2] is_covered_with_solder_mask.
 */
export async function createPlatedHoleRadiusAndMaskRepro(): Promise<{
  circuitJson: CircuitJson
  componentPads: FootprintPad[]
  standalonePads: FootprintPad[]
  kicadPcbString: string
}> {
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
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const [componentFootprint, ...standaloneFootprints] =
    converter.getOutput().footprints
  return {
    circuitJson,
    componentPads: componentFootprint!.fpPads,
    standalonePads: standaloneFootprints.flatMap(
      (footprint) => footprint.fpPads,
    ),
    kicadPcbString: converter.getOutputString(),
  }
}
