import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit-latest"

const RailSheet = ({ name, index }: { name: string; index: number }) => (
  <schematicsheet name={name} displayName={name} sheetIndex={index}>
    <capacitor
      name={`C${index * 2 + 1}`}
      capacitance="100nF"
      footprint="0402"
      pcbX={-5}
      pcbY={index * 5}
      schX={-3}
      connections={{ pin1: "net.VDD", pin2: "net.GND" }}
    />
    <capacitor
      name={`C${index * 2 + 2}`}
      capacitance="100nF"
      footprint="0402"
      pcbX={5}
      pcbY={index * 5}
      schX={3}
      connections={{ pin1: "net.V3_3", pin2: "net.GND" }}
    />
  </schematicsheet>
)

test("power rail nets connect across sheets without merging distinct supplies", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled>
      <net name="VDD" isPowerNet />
      <net name="V3_3" isPowerNet />
      <net name="GND" isGroundNet />
      <RailSheet name="Power" index={0} />
      <RailSheet name="Logic" index={1} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "rails.kicad_sch",
  })
  expect(files).toHaveLength(3)
  const references: string[] = []
  for (const file of files.slice(1)) {
    const schematic = parseKicadSch(file.content)
    const rails = schematic.symbols.filter((symbol) =>
      symbol.properties.some(
        (p) => p.key === "Reference" && p.value.startsWith("#PWR"),
      ),
    )
    expect(rails).toHaveLength(3)
    for (const rail of rails) {
      expect(rail.inBom).toBe(false)
      expect(rail.onBoard).toBe(false)
      references.push(rail.properties.find((p) => p.key === "Reference")!.value)
    }
    const libraryIds = schematic
      .libSymbols!.symbols.map((symbol) => symbol.libraryId)
      .filter((id) => id?.startsWith("Custom:rail_"))
    expect(new Set(libraryIds).size).toBe(libraryIds.length)
  }
  expect(new Set(references).size).toBe(6)

  const tempDir = await mkdtemp(join(tmpdir(), "power-rail-sheets-"))
  try {
    for (const file of files)
      await writeFile(join(tempDir, file.filename), file.content)
    const netlistPath = join(tempDir, "rails.xml")
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      join(tempDir, "rails.kicad_sch"),
    ])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).not.toContain("annotation errors")
    const netlist = await readFile(netlistPath, "utf8")
    const nets = [
      ...netlist.matchAll(/<net\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/net>/g),
    ].map(([, name, body]) => ({
      name,
      pins: [...body!.matchAll(/<node\b[^>]*ref="([^"]+)"[^>]*pin="([^"]+)"/g)]
        .map(([, ref, pin]) => `${ref}.${pin}`)
        .sort(),
    }))
    expect(nets).toEqual([
      { name: "GND", pins: ["C1.2", "C2.2", "C3.2", "C4.2"] },
      { name: "V3_3", pins: ["C2.1", "C4.1"] },
      { name: "VDD", pins: ["C1.1", "C3.1"] },
    ])
    expect(
      [...netlist.matchAll(/<comp ref="([^"]+)"/g)].map(([, ref]) => ref),
    ).toEqual(["C1", "C2", "C3", "C4"])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
