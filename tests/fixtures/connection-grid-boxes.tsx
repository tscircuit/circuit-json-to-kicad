import { Circuit } from "tscircuit"

export const ConnectionGridBox = ({
  side,
  spacing,
  height = 0.6,
}: {
  side: "left" | "right"
  spacing: number
  height?: number
}) => (
  <symbol name={`Box_${side}`}>
    <schematicrect width={1} height={height} />
    <port
      name="1"
      pinNumber={1}
      direction={side}
      schX={side === "left" ? -0.5 : 0.5}
      schY={spacing / 2}
    />
    <port
      name="2"
      pinNumber={2}
      direction={side}
      schX={side === "left" ? -0.5 : 0.5}
      schY={-spacing / 2}
    />
  </symbol>
)

export async function createConnectedGridBoxes({
  spacing,
  height = 0.6,
}: {
  spacing: number
  height?: number
}) {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled schTraceAutoLabelEnabled={false}>
      <chip
        name="U1"
        schX={-2}
        symbol={
          <ConnectionGridBox side="right" spacing={spacing} height={height} />
        }
      />
      <chip
        name="U2"
        schX={2}
        symbol={
          <ConnectionGridBox side="left" spacing={spacing} height={height} />
        }
      />
      <chip
        name="U3"
        schX={2}
        schY={2}
        noConnect={["pin2"]}
        symbol={
          <ConnectionGridBox side="left" spacing={spacing} height={height} />
        }
      />
      <trace name="A" from="U1.pin1" to="U2.pin1" />
      <trace from="U1.pin1" to="U3.pin1" />
      <trace name="B" from="U1.pin2" to="U2.pin2" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
