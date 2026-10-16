import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"

test("repro26: repeated power rail labels split nets in KiCad", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <net name="VDD" isPowerNet />
      <net name="GND" isGroundNet />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        schX={-3}
        pcbX={-3}
        connections={{ pin1: "net.VDD", pin2: "net.GND" }}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0402"
        schX={3}
        pcbX={3}
        connections={{ pin1: "net.VDD", pin2: "net.GND" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const railLabels = circuitJson.filter(
    (element) => element.type === "schematic_net_label",
  )
  expect(
    railLabels.map(({ text, symbol_name }) => [text, symbol_name]),
  ).toEqual([
    ["VDD", "rail_up"],
    ["VDD", "rail_up"],
    ["GND", "rail_down"],
    ["GND", "rail_down"],
  ])
  // Both capacitor pins belong to the same two source nets before export.
  const sourceTraces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )
  for (const net of circuitJson.filter(
    (element) => element.type === "source_net",
  )) {
    const members = new Set(
      sourceTraces
        .filter((trace) =>
          trace.connected_source_net_ids.includes(net.source_net_id),
        )
        .flatMap((trace) => trace.connected_source_port_ids),
    )
    expect(members.size).toBe(2)
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro26-rail-label-connectivity.kicad_sch",
    output,
  )

  // A visual comparison alone cannot prove connectivity: ask KiCad for its netlist.
  const tempDir = await mkdtemp(join(tmpdir(), "rail-label-repro-"))
  try {
    const schematicPath = join(tempDir, "rails.kicad_sch")
    const netlistPath = join(tempDir, "rails.xml")
    await writeFile(schematicPath, output)
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      schematicPath,
    ])
    expect(result.exitCode).toBe(0)
    const netlist = await readFile(netlistPath, "utf8")
    await Bun.write(
      "./debug-output/repro26-rail-label-connectivity.xml",
      netlist,
    )
    const nets = [...netlist.matchAll(/<net\b[^>]*>([\s\S]*?)<\/net>/g)].map(
      ([, body]) =>
        [...body!.matchAll(/<node\b[^>]*ref="([^"]+)"[^>]*pin="([^"]+)"/g)]
          .map(([, ref, pin]) => `${ref}.${pin}`)
          .sort(),
    )
    // Repro baseline, not desired behavior. After a fix, replace these four
    // islands with two nets: [C1.1, C2.1] (VDD), [C1.2, C2.2] (GND), and no
    // GND/VDD component nodes. Repeated rail text currently acts as a refdes.
    expect(nets).toEqual([
      ["C1.1", "VDD.1"],
      ["C1.2", "GND.1"],
      ["C2.1", "VDD.1"],
      ["C2.2", "GND.1"],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
