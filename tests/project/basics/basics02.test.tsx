import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { Circuit } from "tscircuit"

test("adds default net_settings values to KiCad project output", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadProConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const project = JSON.parse(converter.getOutputString())

  expect(project.net_settings.meta.version).toBe(1)
  expect(project.net_settings.classes).toHaveLength(1)
  expect(project.net_settings.classes[0]).toEqual({
    clearance: 0.1,
    diff_pair_width: 0.1,
    track_width: 0.1,
    via_diameter: 0.3,
    via_drill: 0.2,
  })
})
