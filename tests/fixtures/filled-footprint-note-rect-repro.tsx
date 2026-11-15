import { Circuit } from "tscircuit"

export async function createFilledFootprintNoteRectRepro() {
  const circuit = new Circuit()
  circuit.add(
    <board width="26mm" height="16mm" routingDisabled>
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX={0}
              pcbY={-4}
              width={1}
              height={1}
              shape="rect"
            />
            <pcbnoterect
              pcbX={-6}
              pcbY={1}
              width={7}
              height={4}
              strokeWidth={0.2}
              isFilled
            />
            <pcbnoterect
              pcbX={6}
              pcbY={1}
              width={7}
              height={4}
              strokeWidth={0.2}
              isFilled={false}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
