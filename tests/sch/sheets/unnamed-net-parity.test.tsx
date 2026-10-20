import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { Circuit } from "tscircuit-latest"
import { Fragment } from "react"

test("unnamed nets stay distinct across sheets alongside named nets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      {[1, 2].map((n) => (
        <Fragment key={n}>
          <schematicsheet
            name={`Sheet${n}`}
            displayName={`Sheet ${n}`}
            sheetIndex={n - 1}
          >
            <resistor
              name={`R${n}`}
              resistance="1k"
              footprint="0603"
              schX={-3}
              pcbX={-3}
              pcbY={n * 3}
            />
            <capacitor
              name={`C${n}`}
              capacitance="100nF"
              footprint="0603"
              schX={3}
              pcbX={3}
              pcbY={n * 3}
            />
            <trace from={`.R${n} > .pin2`} to={`.C${n} > .pin1`} />
            <trace from={`.R${n} > .pin1`} to="net.GND" />
          </schematicsheet>
        </Fragment>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  // Imported traces can share a display name, even with an explicit net.
  for (const element of circuitJson) {
    if (element.type === "source_trace") element.display_name = "GND"
  }
  const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  schematic.runUntilFinished()
  pcb.runUntilFinished()
  expect(
    pcb
      .getOutput()
      .nets.map((net) => net.name)
      .sort(),
  ).toEqual([
    "",
    "GND",
    "GND_2",
    "GND_3",
    "unconnected-(C1-pin2)",
    "unconnected-(C2-pin2)",
  ])

  const directory = "./debug-output/unnamed-net-sheets"
  const files = schematic.getOutputFiles({
    schematicFilename: "project.kicad_sch",
  })
  expect(files).toHaveLength(3)
  for (const file of files)
    await Bun.write(`${directory}/${file.filename}`, file.content)
  await Bun.write(`${directory}/project.kicad_pcb`, pcb.getOutputString())
  const result = Bun.spawnSync([
    "kicad-cli",
    "pcb",
    "drc",
    "--schematic-parity",
    "--format",
    "json",
    "--output",
    `${directory}/drc.json`,
    `${directory}/project.kicad_pcb`,
  ])
  expect(result.exitCode).toBe(0)
  const report = await Bun.file(`${directory}/drc.json`).json()
  expect(
    report.schematic_parity.filter(
      (violation: { type: string }) => violation.type === "net_conflict",
    ),
  ).toEqual([])
}, 30_000)
