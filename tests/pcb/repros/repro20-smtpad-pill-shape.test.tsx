import { test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const Repro20SmtPadPillShape = () => (
  <board width="8mm" height="8mm" routingDisabled>
    <chip
      name="U1"
      footprint={
        <footprint>
          <smtpad
            shape="pill"
            layer="top"
            width="0.8mm"
            height="1.8mm"
            radius="0.4mm"
            pcbX="-1mm"
            portHints={["pin1"]}
          />
          <smtpad
            shape="pill"
            layer="top"
            width="0.8mm"
            height="1.8mm"
            radius="0.4mm"
            pcbX="1mm"
            pcbRotation={90}
            portHints={["pin2"]}
          />
        </footprint>
      }
    />
  </board>
)

export default Repro20SmtPadPillShape

// will be skipped after approval to make the checks green
test("pcb repro20 pill-shaped smtpad", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro20SmtPadPillShape />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  KicadPcb.parse(outputString)
})
