import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
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
 * Known bug: pcb_keepout elements are dropped entirely by the PCB converter.
 * The converter has no stage that handles pcb_keepout, so they never appear
 * in the KiCad output as (zone ... (keepout ...)) rule areas.
 *
 * Marked test.failing because it asserts the CORRECT behavior (the output
 * should contain a zone with a keepout sub-block), which the current code
 * does not satisfy. The fix is to add an AddKeepoutsStage; remove .failing
 * once it lands.
 */
test.failing("pcb repro29 keepout exports as kicad rule-area zone", async () => {
  const circuitJson = await createRepro29CircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()

  expect(outputString).toContain("(zone")
  expect(outputString).toContain("(keepout")
  expect(outputString).toContain("(tracks not_allowed)")
})
