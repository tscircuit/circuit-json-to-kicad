import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

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

test("repro815: board independence before and after KiCad export", async () => {
  const circuit = new Circuit()
  circuit.add(<PanelNetNamesRepro />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const boardCount = circuitJson.filter((e) => e.type === "pcb_board").length
  const independentNetCount = new Set(
    circuitJson
      .filter((e) => e.type === "source_trace")
      .map((trace) => trace.subcircuit_connectivity_map_key),
  ).size
  expect(boardCount).toBe(9)
  expect(independentNetCount).toBe(9)
  expect(circuitJson.filter((e) => e.type === "pcb_trace")).toHaveLength(9)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  const allNets = pcb.nets.filter((net) => net.id !== 0)
  const nets = allNets.filter((net) => !net.name.startsWith("unconnected-("))
  const isolatedNets = allNets.filter((net) =>
    net.name.startsWith("unconnected-("),
  )
  expect(nets).toHaveLength(9)
  expect(isolatedNets).toHaveLength(18)
  expect(new Set(isolatedNets.map((net) => net.name)).size).toBe(18)
  const pads = pcb.footprints.flatMap((footprint) => footprint.fpPads)
  for (const net of nets)
    expect(pads.filter((pad) => pad.net?.id === net.id)).toHaveLength(2)
  for (const net of isolatedNets)
    expect(pads.filter((pad) => pad.net?.id === net.id)).toHaveLength(1)
  const uniqueNames = new Set(nets.map((net) => net.name)).size
  const tempDir = await mkdtemp(join(tmpdir(), "kicad-pcb-drc-"))
  try {
    const pcbPath = join(tempDir, "panel.kicad_pcb")
    const reportPath = join(tempDir, "drc.json")
    await writeFile(pcbPath, converter.getOutputString())
    await $`kicad-cli pcb drc ${pcbPath} --format json -o ${reportPath}`.quiet()
    const drc = JSON.parse(await readFile(reportPath, "utf8"))
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

    // Each board must keep its own net without needing inter-board connections.
    expect(uniqueNames).toBe(9)
    expect(missingConnections).toBe(0)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120000)
