import { Circuit } from "@tscircuit/core"
import board from "../tests/fixtures/footprint-origin-graphics-board"

const circuit = new Circuit()
circuit.add(board)
await circuit.renderUntilSettled()
const circuitJson = circuit.getCircuitJson()
const components = circuitJson.filter(
  (element) => element.type === "pcb_component",
)
if (!components.every((component) => component.footprint_origin)) {
  throw new Error(
    "Graphics fixture requires the published footprint-origin fix.",
  )
}
await Bun.write(
  new URL(
    "../tests/assets/footprint-origin-graphics.circuit.json",
    import.meta.url,
  ),
  JSON.stringify(circuitJson, null, 2),
)
