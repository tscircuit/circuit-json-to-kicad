import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { Circuit } from "tscircuit"

test("generates KiCad net classes from source net settings", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
      <resistor name="R2" resistance="1k" footprint="0402" />
      <trace from=".R1 > .pin1" to=".R2 > .pin1" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as Array<{
    type: string
    source_net_id?: string
    name?: string
    trace_width?: number
  }>

  circuitJson.push({
    type: "source_net",
    source_net_id: "source_net_clk",
    name: "clk",
    trace_width: 0.245,
  })

  const converter = new CircuitJsonToKicadProConverter(circuitJson as any, {
    projectName: "net_class_project",
  })

  converter.runUntilFinished()

  const project = JSON.parse(converter.getOutputString())
  const defaultClass = project.net_settings.classes.find(
    (netClass: { name: string }) => netClass.name === "Default",
  )

  expect(defaultClass).toMatchObject({
    name: "Default",
    track_width: 0.16,
    clearance: 0.1,
    via_diameter: 0.3,
    via_drill: 0.2,
  })
})
