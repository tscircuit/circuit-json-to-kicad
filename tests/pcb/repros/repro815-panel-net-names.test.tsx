import { beforeAll, expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { runKicadPcbDrc } from "../../fixtures/run-kicad-pcb-drc"

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

let boardCount: number
let independentNetCount: number
let converter: CircuitJsonToKicadPcbConverter
let drc: Awaited<ReturnType<typeof runKicadPcbDrc>>

beforeAll(async () => {
  const circuit = new Circuit()
  circuit.add(<PanelNetNamesRepro />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  boardCount = circuitJson.filter((e) => e.type === "pcb_board").length
  independentNetCount = new Set(
    circuitJson
      .filter((e) => e.type === "source_trace")
      .map((trace) => trace.subcircuit_connectivity_map_key),
  ).size
  expect(boardCount).toBe(9)
  expect(independentNetCount).toBe(9)
  expect(circuitJson.filter((e) => e.type === "pcb_trace")).toHaveLength(9)

  converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().nets.filter((net) => net.id !== 0)).toHaveLength(
    9,
  )
  drc = await runKicadPcbDrc(converter.getOutputString())
}, 120000)

test("repro815: board independence before and after KiCad export", () => {
  const nets = converter.getOutput().nets.filter((net) => net.id !== 0)
  const uniqueNames = new Set(nets.map((net) => net.name)).size
  const missingConnections = drc.unconnected_items.length

  expect(
    [
      "Issue #815: separate boards must not need connections to each other.",
      "KiCad merges nets with the same name, even if their numeric IDs differ.",
      "",
      "CIRCUIT JSON INPUT",
      `Boards: ${boardCount}`,
      `Independent R1.pin2 -> C1.pin1 connections: ${independentNetCount}`,
      "Each connection is already routed within its own board.",
      "",
      "EXPORTED KICAD NETS",
      "Numeric ID | Net name",
      ...nets.map((net) => `${net.id} | ${net.name}`),
      "",
      "EXPECTED VS ACTUAL",
      `Unique net names: expected ${independentNetCount}, actual ${uniqueNames}`,
      `Native KiCad DRC missing connections: expected 0, actual ${missingConnections}`,
      "",
      missingConnections === 0
        ? "PASS: KiCad does not request connections between the independent boards."
        : "BUG: KiCad requests connections between boards that should be independent.",
    ].join("\n"),
  ).toMatchSnapshot()
})

// #815: nine independently routed boards must not need inter-board connections.
test.failing("repro815: native KiCad keeps each board electrically isolated", () => {
  expect(drc.unconnected_items).toHaveLength(0)
})
