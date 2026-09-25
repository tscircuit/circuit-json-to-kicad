import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { $ } from "bun"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// https://github.com/tscircuit/circuit-json-to-kicad/issues/595
// Power nets must be emitted as real KiCad power symbols (per-net
// `power:<netName>` library entries carrying `(power global)`, a hidden
// `#PWR` reference and the net name as the pin name) so KiCad joins every
// rail instance onto the same net instead of treating each as a component.
test("repro595 power nets emit power: lib symbols with joined nets", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <capacitor
        name="C1"
        polarized
        capacitance="220uF"
        footprint="electrolytic_d10mm_p5mm"
        pcbX={0}
        pcbY={0}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0603"
        pcbX={8}
        pcbY={0}
      />
      <trace from=".C1 > .pin1" to="net.V24" />
      <trace from=".C1 > .pin2" to="net.GND" />
      <trace from=".C2 > .pin1" to="net.V24" />
      <trace from=".C2 > .pin2" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  await Bun.write(
    "./debug-output/repro595-power-net-rail-symbols.kicad_sch",
    output,
  )

  // One library symbol per power net, flagged as a power symbol
  expect(output.match(/\(symbol "power:GND"/g)).toHaveLength(1)
  expect(output.match(/\(symbol "power:V24"/g)).toHaveLength(1)
  expect(output.match(/\(power global\)/g)).toHaveLength(2)

  // The net joins through the pin name and the Value property
  expect(output).toContain('(name "V24"')
  expect(output).toContain('(name "GND"')
  expect(output).toContain('(property "Value" "V24"')
  expect(output).toContain('(property "Value" "GND"')

  // No shared Custom:rail_* lib ids and no net-name references
  expect(output).not.toContain('"Custom:rail_')
  expect(output).not.toContain('(property "Reference" "GND"')
  expect(output).not.toContain('(property "Reference" "V24"')

  // Every rail instance uses the per-net power lib and a unique #PWR ref
  const libIds = output.match(/\(lib_id "power:[^"]+"\)/g) ?? []
  expect(libIds.sort()).toEqual([
    '(lib_id "power:GND")',
    '(lib_id "power:V24")',
  ])
  const refs = output.match(/\(property "Reference" "#PWR\d+"/g) ?? []
  expect(refs).toHaveLength(2)
  expect(new Set(refs).size).toBe(2)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  // The exported netlist must carry the power net names and join the rail
  // connections into shared nets instead of anonymous Net-(...) splits.
  const tmpDir = await mkdtemp(join(tmpdir(), "repro595-netlist-"))
  const schPath = join(tmpDir, "repro595.kicad_sch")
  const netPath = join(tmpDir, "repro595.net")
  await Bun.write(schPath, output)
  const netlistResult =
    await $`kicad-cli sch export netlist ${schPath} -o ${netPath}`.quiet()
  expect(netlistResult.exitCode).toBe(0)
  const netlist = await Bun.file(netPath).text()

  const nodesOnNet = (netName: string) => {
    const nameIndex = netlist.indexOf(`(name "${netName}")`)
    if (nameIndex === -1) return []
    const rest = netlist.slice(nameIndex)
    const netEnd = rest.slice(1).search(/\n\s*\(net\b/)
    const netSection = netEnd === -1 ? rest : rest.slice(0, netEnd + 1)
    return [...netSection.matchAll(/\(ref "([^"]+)"\)/g)].map((m) => m[1])
  }
  expect(nodesOnNet("V24").sort()).toEqual(["C1", "C2"])
  expect(nodesOnNet("GND")).toContain("C2")
  expect(netlist).not.toContain('(name "Net-(')

  const stackedSnapshot = await stackCircuitJsonKicadPngs(
    await takeCircuitJsonSnapshot({
      circuitJson,
      outputType: "schematic",
    }),
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  )
  expect(stackedSnapshot).toMatchPngSnapshot(import.meta.path)

  await Bun.write(
    "./debug-output/repro595-power-net-rail-symbols.stacked.png",
    stackedSnapshot,
  )
})
