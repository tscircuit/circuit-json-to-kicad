import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { Circuit } from "tscircuit"

test("repro674: unnamed nets agree between schematic and PCB", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  schematic.runUntilFinished()
  pcb.runUntilFinished()

  const basename = "./debug-output/repro674-unnamed-net-parity"
  await Bun.write(`${basename}.kicad_sch`, schematic.getOutputString())
  await Bun.write(`${basename}.kicad_pcb`, pcb.getOutputString())
  // Net names are metadata: a board image cannot show the mismatch.
  const result = Bun.spawnSync([
    "kicad-cli",
    "pcb",
    "drc",
    "--schematic-parity",
    "--format",
    "json",
    "--output",
    `${basename}.json`,
    `${basename}.kicad_pcb`,
  ])
  expect(result.exitCode).toBe(0)
  const report = await Bun.file(`${basename}.json`).json()
  const conflicts = report.schematic_parity.filter(
    (violation: { type: string }) => violation.type === "net_conflict",
  )
  // Both connected and isolated pads must agree with the schematic (#674).
  expect(conflicts).toHaveLength(0)
}, 30_000)
