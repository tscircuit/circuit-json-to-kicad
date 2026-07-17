import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

/**
 * Regression test for issue #372: fiducial SMD pads were exported with an
 * F.Paste aperture even though the circuit JSON emits no pcb_solder_paste for
 * fiducials. A paste aperture on a fiducial smears solder during reflow and
 * defeats the optical vision target.
 *
 * We verify using the raw KiCad PCB string so we are not tied to kicadts
 * object internals (PadLayers is not a plain array).
 */
test("fiducial pad is exported without F.Paste aperture", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip name="U1">
        <fiducial name="F1" pcbX={0} pcbY={0} padDiameter="1mm" />
      </chip>
      <resistor
        name="R1"
        footprint="0402"
        pcbX={5}
        pcbY={5}
        resistance="10k"
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Split the output into footprint blocks so we can check per-footprint layers.
  // A footprint block starts with "(footprint" and ends before the next "(footprint"
  // or the end of the file.
  const footprintBlocks = outputString
    .split(/(?=\(footprint\s)/)
    .filter((block) => block.trimStart().startsWith("(footprint"))

  const fiducialBlock = footprintBlocks.find((block) =>
    block.includes("fiducial"),
  )
  const resistorBlock = footprintBlocks.find((block) =>
    /resistor|res0402/.test(block),
  )

  expect(fiducialBlock).toBeDefined()
  expect(resistorBlock).toBeDefined()

  // Fiducial must NOT export a paste aperture layer
  expect(fiducialBlock).not.toContain("F.Paste")
  expect(fiducialBlock).not.toContain("B.Paste")

  // Fiducial must still have copper and mask
  expect(fiducialBlock).toContain(".Cu")
  expect(fiducialBlock).toContain(".Mask")

  // Resistor pads SHOULD still have paste (they have pcb_solder_paste elements)
  expect(resistorBlock).toContain("Paste")
})
