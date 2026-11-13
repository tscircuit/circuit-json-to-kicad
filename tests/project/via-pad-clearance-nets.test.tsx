import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { getKicadPcbDrc } from "../fixtures/get-kicad-pcb-drc"

test("only the different-net via violates clearance around a connected pad", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width={5}
      height={3}
      routingDisabled
      minViaEdgeToPadEdgeClearance={0.2}
    >
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        pinLabels={{ pin1: "SIG" }}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width={0.6}
              height={0.5}
              portHints={["pin1"]}
            />
          </footprint>
        }
      />
      <trace from=".U1 > .pin1" to="net.SIG" />
      <net name="OTHER" />
      <via
        pcbX={-0.64}
        pcbY={0}
        outerDiameter={0.4}
        holeDiameter={0.2}
        connectsTo="net.SIG"
      />
      <via
        pcbX={0.64}
        pcbY={0}
        outerDiameter={0.4}
        holeDiameter={0.2}
        connectsTo="net.OTHER"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const pcb = new CircuitJsonToKicadPcbConverter(json)
  pcb.runUntilFinished()
  const project = new CircuitJsonToKicadProConverter(json, {
    projectName: "board",
  })
  const drc = await getKicadPcbDrc(
    pcb.getOutputString(),
    project.getOutputFiles(),
  )
  const errors = drc.violations.filter((v) => v.type === "clearance")
  expect(errors).toHaveLength(1)
  expect(errors[0]!.description).toMatch(
    /rule 'Via to pad copper clearance'.*0\.2000 mm.*0\.1400 mm/,
  )
}, 30_000)
