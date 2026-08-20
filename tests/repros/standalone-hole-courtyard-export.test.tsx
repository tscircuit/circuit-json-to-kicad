import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

// A board-level courtyard around a standalone mounting hole is preserved in
// Circuit JSON but omitted from the KiCad PCB export.
test.failing("standalone hole courtyard is exported to KiCad", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <hole name="H1" diameter="3.2mm" pcbX={0} pcbY={0} />
      <courtyardcircle pcbX={0} pcbY={0} radius={2} layer="top" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  expect(circuitJson.some((element) => element.type === "pcb_hole")).toBe(true)
  expect(
    circuitJson.some((element) => element.type === "pcb_courtyard_circle"),
  ).toBe(true)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)

  // This currently fails because standalone courtyard circles are not added
  // to the standalone-hole footprint in the KiCad output. Checking for
  // `gr_circle` avoids matching KiCad's always-present layer declaration.
  expect(converter.getOutputString()).toContain("(gr_circle")
})
