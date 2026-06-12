import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const getZoneBlock = (kicadPcb: string) => {
  const zoneStart = kicadPcb.lastIndexOf("  (zone")
  const boardEnd = kicadPcb.lastIndexOf("\n)")
  return kicadPcb.slice(zoneStart, boardEnd)
}

test("pcb basics17 copper pour", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <chip name="U1" footprint="soic8" pcbX={-6} pcbY={0} />
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={6} pcbY={4} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        pcbX={6}
        pcbY={-4}
      />
      <trace from=".R1 > .pin2" to="net.GND" />
      <trace from=".C1 > .pin2" to="net.GND" />
      <trace from=".U1 > .pin4" to="net.GND" />
      <copperpour connectsTo="net.GND" layer="top" clearance="0.15mm" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const parsedPcb = parseKicadPcb(outputString)

  expect(outputString).toContain("(zone")
  expect(outputString).toContain("(layer F.Cu)")
  expect(outputString).toContain("(polygon")
  expect(outputString).toContain("(filled_polygon")
  expect(outputString).toContain("(island_removal_mode 0)")
  expect(parsedPcb.zones[0]?.filledPolygons.length ?? 0).toBeGreaterThan(0)

  const zoneBlock = getZoneBlock(outputString)
  expect(zoneBlock).toContain("(net 1)")
  expect(zoneBlock).toContain("(net_name GND)")
  expect(zoneBlock).toContain("(layer F.Cu)")
  expect(zoneBlock).toContain("(clearance 0.15)")
  expect(zoneBlock).toContain("(xy 114.85 109.85)")
  expect(zoneBlock).toContain("(xy 85.15 90.15)")

  const kicadPcbFixture = await readFile(
    "tests/assets/basics17-copper-pour.kicad_pcb",
    "utf8",
  )
  expect(kicadPcbFixture).toContain("(filled_polygon")
  expect(kicadPcbFixture).toContain("(island_removal_mode 0)")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadPcbFixture,
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
