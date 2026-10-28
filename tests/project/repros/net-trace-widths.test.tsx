import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro: source net trace widths are omitted from KiCad net settings", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="20mm"
      routingDisabled
      minViaPadDiameter="0.6mm"
      minViaHoleDiameter="0.3mm"
    >
      <net name="MOTOR_PHASE" nominalTraceWidth="2mm" />
      <net name="LOGIC_3V3" nominalTraceWidth="0.3mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "net-trace-width-repro",
  })

  expect({
    sourceNets: circuitJson
      .filter((element) => element.type === "source_net")
      .map(({ name, trace_width }) => ({ name, trace_width })),
    generatedNetSettings: converter.getOutput().net_settings,
  }).toMatchSnapshot()
})
