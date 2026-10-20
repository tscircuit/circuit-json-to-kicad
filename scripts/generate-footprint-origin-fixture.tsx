// Regenerate with a tscircuit release containing core#4806.
import { Circuit } from "tscircuit"
import board from "../tests/fixtures/footprint-origin-board"

const circuit = new Circuit()
circuit.add(board)
await circuit.renderUntilSettled()
const circuitJson = circuit.getCircuitJson()
const components = circuitJson.filter(
  (element) => element.type === "pcb_component",
)
if (!components.every((component) => "footprint_origin" in component)) {
  throw new Error(
    "This fixture requires a core release that preserves footprint origins (#4628).",
  )
}
await Bun.write(
  new URL("../tests/assets/footprint-origin.circuit.json", import.meta.url),
  JSON.stringify(circuitJson, null, 2),
)
