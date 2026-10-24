import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getNativeNetConflicts } from "../fixtures/get-native-net-conflicts"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("unnamed nets and isolated pads agree between schematic and PCB", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={3}
        pcbY={0}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(await getNativeNetConflicts(circuitJson)).toEqual([])
  const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  schematic.runUntilFinished()
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: schematic.getOutputString(),
    kicadFileType: "sch",
  })
  expect(snapshot.exitCode).toBe(0)
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
