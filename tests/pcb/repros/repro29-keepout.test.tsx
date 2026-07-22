import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { parseKicadPcb } from "kicadts"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Repro29Keepout = () => (
  <board width="20mm" height="20mm">
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-4} pcbY={0} />
    <trace from=".R1 > .pin1" to="net.GND" />
  </board>
)

export default Repro29Keepout

const createRepro29CircuitJson = async () => {
  const circuit = new Circuit()
  circuit.add(<Repro29Keepout />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as any[]
  circuitJson.push({
    type: "pcb_keepout",
    shape: "rect",
    center: { x: 0, y: 0 },
    width: 6,
    height: 6,
    pcb_keepout_id: "ko0",
    layers: ["top"],
  })
  return circuitJson
}

test(
  "pcb repro29 keepout snapshot",
  async () => {
    const circuitJson = await createRepro29CircuitJson()
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
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

/**
 * Regression test: pcb_keepout elements are converted to KiCad rule-area zones.
 *
 * kicad-cli's SVG plotter explicitly skips rule-area zones
 * (GetIsRuleArea() → continue in PlotStandardLayer), so the keepout
 * produces zero SVG elements regardless of export resolution.  The visual
 * snapshot therefore cannot differ with or without the fix.
 *
 * The parsed-object assertions below provide authoritative structural proof
 * that the KiCad output contains the keepout zone with all five ZoneKeepout
 * constraints set to "not_allowed".
 */
test("pcb repro29 keepout exports as kicad rule-area zone", async () => {
  const circuitJson = await createRepro29CircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const parsedPcb = parseKicadPcb(converter.getOutputString())
  expect(parsedPcb.zones.length).toBeGreaterThan(0)
  const keepoutZone = parsedPcb.zones[0]!
  expect(keepoutZone.keepout).toBeDefined()
  expect(keepoutZone.keepout!.tracks).toBe("not_allowed")
  expect(keepoutZone.keepout!.vias).toBe("not_allowed")
  expect(keepoutZone.keepout!.pads).toBe("not_allowed")
  expect(keepoutZone.keepout!.copperpour).toBe("not_allowed")
  expect(keepoutZone.keepout!.footprints).toBe("not_allowed")
  expect(keepoutZone.filledPolygons).toHaveLength(0)
  expect(keepoutZone.net).toBe(0)
})
