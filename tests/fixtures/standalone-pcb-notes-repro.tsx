import { Circuit } from "tscircuit"

export async function createStandalonePcbNotesRepro() {
  const circuit = new Circuit()
  circuit.add(
    <board width="32mm" height="24mm" routingDisabled>
      <pcbnoterect pcbX={-8} pcbY={6} width={8} height={4} strokeWidth={0.2} />
      <pcbnoteline x1={4} y1={6} x2={12} y2={6} strokeWidth={0.2} />
      <pcbnotepath
        route={[
          { x: -12, y: -1 },
          { x: -8, y: 2 },
          { x: -4, y: -1 },
        ]}
        strokeWidth={0.2}
      />
      <chip
        name="U1"
        pcbY={-7}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX={-11}
              pcbY={0}
              width={1}
              height={1}
              shape="rect"
            />
            <pcbnoterect
              pcbX={0}
              pcbY={0}
              width={8}
              height={3}
              strokeWidth={0.2}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
