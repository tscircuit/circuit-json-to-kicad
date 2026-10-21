import { expect, test } from "bun:test"
import { createElement } from "react"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro37: a route hop outside a standalone via span is preserved", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={8} height={6} layers={4}>
      <via
        name="V1"
        holeDiameter={0.2}
        outerDiameter={0.45}
        fromLayer="inner1"
        toLayer="inner2"
      />
      {createElement("pcbtrace", {
        route: [
          { route_type: "wire", x: -3, y: 0, width: 0.15, layer: "top" },
          { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "top" },
          {
            route_type: "via",
            x: 0,
            y: 0,
            from_layer: "top",
            to_layer: "inner1",
          },
          { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "inner1" },
          { route_type: "wire", x: 3, y: 0, width: 0.15, layer: "inner1" },
        ],
      })}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "pcb_via"),
  ).toHaveLength(1)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
})
