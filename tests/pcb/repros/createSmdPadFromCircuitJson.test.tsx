import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test(
  "0402 footprints keep pad rotation when component is rotated 45 degrees",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="20mm" height="20mm" routingDisabled>
        <resistor
          name="R1"
          footprint="0402"
          pcbX={0}
          pcbY={0}
          pcbRotation={45}
          resistance="10"
        />
        <capacitor
          name="C1"
          footprint="0402"
          pcbX={0}
          pcbY={3}
          pcbRotation={45}
          capacitance="10"
        />
      </board>,
    )

    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const outputString = converter.getOutputString()
    const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

    expect(kicadPcb.footprints.length).toBe(2)

    for (const libraryLink of [
      "tscircuit:resistor_0402",
      "tscircuit:capacitor_0402",
    ]) {
      const footprint = kicadPcb.footprints.find(
        (candidate) => candidate.libraryLink === libraryLink,
      )

      expect(footprint).toBeDefined()

      const pad1 = footprint!.fpPads.find((pad) => pad.number === "1")
      const pad2 = footprint!.fpPads.find((pad) => pad.number === "2")

      expect(pad1).toBeDefined()
      expect(pad2).toBeDefined()

      expect(pad1!.at?.x).toBeCloseTo(-0.51, 2)
      expect(pad1!.at?.y).toBeCloseTo(0, 5)
      expect(pad1!.at?.angle).toBe(45)

      expect(pad2!.at?.x).toBeCloseTo(0.51, 2)
      expect(pad2!.at?.y).toBeCloseTo(0, 5)
      expect(pad2!.at?.angle).toBe(45)
    }

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)

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
