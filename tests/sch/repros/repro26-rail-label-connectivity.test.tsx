import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro26: repeated power rail labels share nets in KiCad", async () => {
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
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
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
    const reportPath = join(tempDir, "erc.json")
    const erc = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "erc",
      "--format",
      "json",
      "--output",
      reportPath,
      schematicPath,
    ])
    expect(erc.exitCode).toBe(0)
    const report: { sheets: { violations: { type: string }[] }[] } = JSON.parse(
      await readFile(reportPath, "utf8"),
    )
    // This passive fixture has no power source; library lookup and undriven
    // power warnings are expected, but off-grid or disconnected pins are not.
    expect(
      report.sheets
        .flatMap((sheet) => sheet.violations)
        .map((violation) => violation.type)
        .filter(
          (type) =>
            !["lib_symbol_issues", "power_pin_not_driven"].includes(type),
        ),
    ).toEqual([])
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
    // #660 produced four islands and fake VDD/GND component nodes.
    expect(nets).toEqual([
      ["C1.2", "C2.2"],
      ["C1.1", "C2.1"],
    ])
    expect(
      [...netlist.matchAll(/<comp ref="([^"]+)"/g)].map(([, ref]) => ref),
    ).toEqual(["C1", "C2"])
    expect(result.stdout.toString()).not.toContain("annotation errors")
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
