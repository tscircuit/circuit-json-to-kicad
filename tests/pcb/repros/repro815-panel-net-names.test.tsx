import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { runKicadPcbDrc } from "../../fixtures/run-kicad-pcb-drc"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const PanelNetNamesRepro = () => (
  <panel
    layoutMode="grid"
    row={3}
    col={3}
    boardGap="2mm"
    panelizationMethod="tab-routing"
    tabLength="3mm"
  >
    {Array.from({ length: 9 }, (_, i) => (
      <board key={i} width="14mm" height="18mm">
        <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
        <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>
    ))}
  </panel>
)

export default PanelNetNamesRepro

let circuitJson: CircuitJson
let converter: CircuitJsonToKicadPcbConverter
let drc: Awaited<ReturnType<typeof runKicadPcbDrc>>

beforeAll(async () => {
  const circuit = new Circuit()
  circuit.add(<PanelNetNamesRepro />)
  await circuit.renderUntilSettled()
  circuitJson = circuit.getCircuitJson()
  expect(circuitJson.filter((e) => e.type === "pcb_board")).toHaveLength(9)
  expect(circuitJson.filter((e) => e.type === "pcb_trace")).toHaveLength(9)

  converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().nets.filter((net) => net.id !== 0)).toHaveLength(
    9,
  )
  drc = await runKicadPcbDrc(converter.getOutputString())
}, 120000)

test("repro815: stacked Circuit JSON/KiCad panel and native connectivity", async () => {
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
    // #813 leaves only one board outline; board-area cropping hides the rest.
    pcbPageSizeMode: 1,
  })
  expect(snapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      await sharp(snapshot.generatedFileContent["temp_file.png"]!)
        .trim({ background: "#000000" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)

  // Copper geometry alone cannot show KiCad merging identically named nets.
  expect({
    exportedNetNames: converter
      .getOutput()
      .nets.filter((net) => net.id !== 0)
      .map((net) => net.name),
    unconnectedItems: drc.unconnected_items.length,
  }).toMatchSnapshot()
}, 120000)

// #815: nine independently routed boards must not need inter-board connections.
test.failing("repro815: native KiCad keeps each board electrically isolated", () => {
  expect(drc.unconnected_items).toHaveLength(0)
})
