import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test(
  "standalone fiducials export as KiCad SMT pads",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="30mm" height="20mm">
        <fiducial
          name="FID1"
          padDiameter="1mm"
          soldermaskPullback="1mm"
          pcbX={-10}
          pcbY={-5}
        />
        <fiducial
          name="FID2"
          padDiameter="1mm"
          soldermaskPullback="1mm"
          pcbX={10}
          pcbY={5}
        />
      </board>,
    )

    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const outputString = converter.getOutputString()
    const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

    expect(kicadPcb.footprints).toHaveLength(2)
    expect(
      kicadPcb.footprints.every(
        (footprint) =>
          footprint.libraryLink === "tscircuit:smtpad_circle_diameter1mm",
      ),
    ).toBe(true)

    expect(outputString).toContain("(at 90 105 0)")
    expect(outputString).toContain("(at 110 95 0)")
    expect(kicadPcb.footprints[0]!.fpPads[0]!.solderMaskMargin).toBe(1)
    expect(outputString).toContain("(solder_mask_margin 1)")

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
    })

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
