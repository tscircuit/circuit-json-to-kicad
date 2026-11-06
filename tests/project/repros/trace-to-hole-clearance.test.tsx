import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro: KiCad hole clearance uses trace-to-pad clearance", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="20mm"
      routingDisabled
      minTraceToPadEdgeClearance="0.1mm"
      minTraceToHoleEdgeClearance="0.2mm"
      minViaPadDiameter="0.6mm"
      minViaHoleDiameter="0.3mm"
    />,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const pcbBoard = circuitJson.find((element) => element.type === "pcb_board")
  if (!pcbBoard) throw new Error("Expected TSX board to generate a pcb_board")

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "trace-to-hole-clearance-repro",
  })

  expect({
    sourceClearances: {
      traceToPad: pcbBoard.min_trace_to_pad_edge_clearance,
      traceToHole: pcbBoard.min_trace_to_hole_edge_clearance,
    },
    generatedRules: converter.getOutput().board.design_settings.rules,
  }).toMatchSnapshot()
})
