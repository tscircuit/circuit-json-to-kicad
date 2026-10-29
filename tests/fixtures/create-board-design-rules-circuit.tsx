import { Circuit } from "tscircuit"

export async function createBoardDesignRulesCircuit(
  minBoardEdgeClearance?: number,
) {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="20mm"
      minTraceWidth={0.25}
      minBoardEdgeClearance={minBoardEdgeClearance}
    >
      {[
        // The right edge is at x=10. The 1 mm pads have 0.4/0.2 mm gaps.
        { name: "Clear", x: 9.1, y: 0 },
        { name: "TooClose", x: 9.3, y: 4 },
        { name: "A", x: -2, y: -4 },
        { name: "B", x: 2, y: -4 },
      ].map(({ name, x, y }) => (
        <chip
          key={name}
          name={name}
          pcbX={x}
          pcbY={y}
          pinLabels={{ pin1: "P1" }}
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                pcbX={0}
                pcbY={0}
                width="1mm"
                height="1mm"
                shape="rect"
              />
            </footprint>
          }
        />
      ))}
      <trace
        from=".A > .pin1"
        to=".B > .pin1"
        thickness={0.2}
        pcbPath={[
          { x: -2, y: -4 },
          { x: 2, y: -4 },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
