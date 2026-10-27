import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("hint-derived pad number does not collide with real pin number or earlier hint", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
            <smtpad
              portHints={["1"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const footprints = converter.getOutput().footprints
  expect(footprints).toHaveLength(1)
  const padNumbers = footprints[0]!.fpPads.map((pad) => pad.number)
  expect(padNumbers).toEqual(["1", "2"])
})

test("hint-derived plated hole pad number does not collide with SMD real pin number", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
            <platedhole
              portHints={["1"]}
              pcbX="1mm"
              pcbY="0mm"
              shape="circle"
              outerDiameter="1mm"
              holeDiameter="0.5mm"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const footprints = converter.getOutput().footprints
  expect(footprints).toHaveLength(1)
  const padNumbers = footprints[0]!.fpPads.map((pad) => pad.number)
  expect(padNumbers).toEqual(["1", "2"])
})
