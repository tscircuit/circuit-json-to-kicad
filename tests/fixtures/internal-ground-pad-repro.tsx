import { Circuit } from "tscircuit"

export async function createInternalGroundPadRepro() {
  const circuit = new Circuit()
  circuit.add(
    <board width="14mm" height="12mm" routingDisabled>
      <chip
        name="U1"
        pinLabels={{ pin39: "GND" }}
        footprint={
          <footprint>
            {[-2, 0, 2].flatMap((x) =>
              [-2, 0, 2].map((y) => (
                <smtpad
                  portHints={["pin39"]}
                  pcbX={x}
                  pcbY={y}
                  width={1.4}
                  height={1.4}
                  shape="rect"
                />
              )),
            )}
          </footprint>
        }
      />
      <net name="GND" />
      <trace from=".U1 > .pin39" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
