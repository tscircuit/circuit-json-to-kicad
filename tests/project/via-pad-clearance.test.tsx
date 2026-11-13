import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { getKicadPcbDrc } from "../fixtures/get-kicad-pcb-drc"

test("KiCad uses the exported via-to-pad minimum for the 0.14 mm copper gap", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width={2.5}
      height={1.5}
      minViaEdgeToPadEdgeClearance={0.2}
      minPadEdgeToPadEdgeClearance={0.1}
    >
      <smtpad shape="rect" width={0.6} height={0.5} pcbX={0} pcbY={0} />
      <via
        pcbX={0.64}
        pcbY={0}
        outerDiameter={0.4}
        holeDiameter={0.2}
        fromLayer="top"
        toLayer="bottom"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const board = json.find((element) => element.type === "pcb_board")!
  expect(board.min_via_edge_to_pad_edge_clearance).toBe(0.2)
  const pcb = new CircuitJsonToKicadPcbConverter(json)
  pcb.runUntilFinished()
  const project = () =>
    new CircuitJsonToKicadProConverter(json, { projectName: "board" })

  const viaPadErrors = async () => {
    const drc = await getKicadPcbDrc(pcb.getOutputString(), [
      { filename: "board.kicad_pro", content: project().getOutputString() },
    ])
    return drc.violations.filter((v) => v.type === "clearance")
  }
  const errors = await viaPadErrors()
  expect(errors).toHaveLength(1)
  expect(errors[0]!.description).toMatch(/0\.2000 mm.*0\.1400 mm/)

  board.min_via_edge_to_pad_edge_clearance = 0.1
  board.min_pad_edge_to_pad_edge_clearance = 0.2
  expect(await viaPadErrors()).toHaveLength(0)
}, 30_000)
