import { Circuit } from "tscircuit"

export async function createStandalonePcbNoteRepro() {
  const circuit = new Circuit()
  circuit.add(
    <board width="26mm" height="16mm" routingDisabled>
      <pcbnotetext
        text="BOARD NOTE"
        pcbX={0}
        pcbY={4}
        fontSize={1}
        anchorAlignment="center"
      />
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
            <pcbnotetext
              text="FOOTPRINT NOTE"
              pcbX={0}
              pcbY={0}
              fontSize={0.8}
              anchorAlignment="center"
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
