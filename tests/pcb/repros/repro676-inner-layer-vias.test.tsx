import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro676: duplicate inner-layer vias", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="24mm" height="16mm" layers={4}>
      <copperpour
        connectsTo="net.GND"
        layer="inner1"
        clearance="0.3mm"
        boardEdgeMargin="0.5mm"
      />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-6}
        pcbY={4}
        connections={{ pin2: "net.GND" }}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        pcbX={6}
        pcbY={4}
        connections={{ pin1: "net.GND" }}
      />
      <resistor
        name="R3"
        resistance="1k"
        footprint="0603"
        pcbX={-6}
        pcbY={-4}
        connections={{ pin2: "net.GND" }}
      />
      <resistor
        name="R4"
        resistance="1k"
        footprint="0603"
        pcbX={6}
        pcbY={-4}
        connections={{ pin1: "net.GND" }}
      />
      <trace name="A" from=".R1 > .pin1" to=".R4 > .pin2" />
      <trace name="B" from=".R2 > .pin2" to=".R3 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write("debug-output/repro676-inner-layer-vias.kicad_pcb", output)

  // Capture #676: eight physical vias become fourteen exported vias.
  expect(circuitJson.filter((e) => e.type === "pcb_via")).toHaveLength(8)
  expect(parseKicadPcb(output).vias).toHaveLength(14)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120000)
