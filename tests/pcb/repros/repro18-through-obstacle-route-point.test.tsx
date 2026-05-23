import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/diy-power-delivery-trigger.circuit.json"
import type { CircuitJson } from "circuit-json"

test("repro18: through_obstacle route points do not emit NaN segments", () => {
  const hasThroughObstacle = (circuitJson as CircuitJson).some(
    (elm) =>
      elm.type === "pcb_trace" &&
      elm.route?.some(
        (routePoint: any) => routePoint.route_type === "through_obstacle",
      ),
  )
  expect(hasThroughObstacle).toBe(true)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).not.toContain("NaN")
})
