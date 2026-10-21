import { Circuit } from "tscircuit"

export async function createStandalonePcbNoteRectRepro() {
  const circuit = new Circuit()
  circuit.add(
    <board width="26mm" height="18mm" routingDisabled>
      <pcbnoterect pcbX={0} pcbY={4} width={10} height={4} strokeWidth={0.2} />
      <chip
        name="U1"
        pcbY={-4}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX={-8}
              pcbY={0}
              width={1}
              height={1}
              shape="rect"
            />
            <pcbnoterect
              pcbX={0}
              pcbY={0}
              width={10}
              height={4}
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
