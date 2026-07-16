import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

/**
 * Known bug: Fiducial pads incorrectly export with F.Paste layer (Issue #372).
 *
 * Solder paste is suppressed by default on optical target fiducials.
 * Marked `test.failing` because it asserts the CORRECT behavior (fiducial
 * pads should not contain F.Paste, and the generated KiCad output should
 * use `(layers F.Cu F.Mask)`). Remove `.failing` once the fix lands.
 */
test.failing(
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

    for (const footprint of kicadPcb.footprints) {
      const pad = footprint.fpPads[0]!
      const padLayers = pad.layers!.layers
      expect(padLayers).toContain("F.Cu")
      expect(padLayers).toContain("F.Mask")
      expect(padLayers).not.toContain("F.Paste")
    }
    expect(outputString).toContain("(layers F.Cu F.Mask)")
    expect(outputString).not.toContain("(layers F.Cu F.Paste F.Mask)")
    expect(outputString).not.toContain("(layers F.Cu F.Mask F.Paste)")

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
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
