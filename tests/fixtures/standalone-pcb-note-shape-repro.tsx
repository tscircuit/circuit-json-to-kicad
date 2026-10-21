import { Circuit } from "tscircuit"

export type NoteShape = "line" | "path" | "dimension"

export async function createStandalonePcbNoteShapeRepro(shape: NoteShape) {
  const circuit = new Circuit()
  const annotations = {
    line: <pcbnoteline x1={-5} y1={4} x2={5} y2={4} strokeWidth={0.2} />,
    path: (
      <pcbnotepath
        route={[
          { x: -5, y: 3 },
          { x: 0, y: 6 },
          { x: 5, y: 3 },
        ]}
        strokeWidth={0.2}
      />
    ),
    dimension: (
      <pcbnotedimension
        from={{ x: -5, y: 4 }}
        to={{ x: 5, y: 4 }}
        fontSize={0.8}
        arrowSize={0.5}
      />
    ),
  }
  circuit.add(
    <board width="26mm" height="18mm" routingDisabled>
      {annotations[shape]}
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
