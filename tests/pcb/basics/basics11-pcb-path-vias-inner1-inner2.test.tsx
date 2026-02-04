// bun test tests/pcb/basics/basics09-pcb-path-vias-inner1-inner2.test.tsx
// BUN_UPDATE_SNAPSHOTS=1 bun test tests/pcb/basics/basics09-pcb-path-vias-inner1-inner2.test.tsx
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb basics09 pcbPath vias inner1 inner2", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="14mm" layers={4}>
      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        pcbX={-5}
        pcbY={0}
      />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} pcbY={0} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPathRelativeTo=".R1 > .pin2"
        pcbPath={
          [
            { x: 1, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
            { x: 1, y: 3 },
            { x: 6, y: 3, via: true, fromLayer: "inner1", toLayer: "inner2" },
            { x: 6, y: -3 },
            { x: 11, y: -3, via: true, fromLayer: "inner2", toLayer: "top" },
          ] as Array<{
            x: number
            y: number
            via?: boolean
            fromLayer?: "top" | "inner1" | "inner2" | "bottom"
            toLayer?: "top" | "inner1" | "inner2" | "bottom"
          }>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  Bun.write(
    "./debug-output/basics09-pcb-path-vias-inner1-inner2.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  Bun.write(
    "./debug-output/basics09-pcb-path-vias-inner1-inner2.kicad_pcb",
    outputString,
  )

  expect(outputString).toMatch(/\(via\b/)
  expect(outputString).toMatch(/\(segment[\s\S]*?\(layer In1\.Cu\)/)
  expect(outputString).toMatch(/\(segment[\s\S]*?\(layer In2\.Cu\)/)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
