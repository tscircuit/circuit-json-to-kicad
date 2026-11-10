import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("falls back to finite defaults when hole, via, or platedhole dimensions are NaN or non-finite (#403)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" />
      <hole name="H1" diameter={"abc" as any} pcbX={2} pcbY={2} />
      <via
        holeDiameter={"abc" as any}
        outerDiameter={"def" as any}
        pcbX={-2}
        pcbY={2}
        fromLayer="top"
        toLayer="bottom"
      />
      <platedhole
        shape="circle"
        holeDiameter={"abc" as any}
        outerDiameter={"def" as any}
        pcbX={2}
        pcbY={-2}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  expect(output).not.toContain("NaN")
  expect(output).not.toContain("undefined")
  expect(output).not.toContain("null")

  const parsedPcb = KicadPcb.parse(output)[0] as KicadPcb
  expect(parsedPcb).toBeInstanceOf(KicadPcb)

  const holeFootprint = parsedPcb?.footprints.find((fp) =>
    fp.libraryLink?.startsWith("tscircuit:hole_circle_"),
  )
  expect(holeFootprint?.libraryLink).toBe(
    "tscircuit:hole_circle_holeDiameter1mm",
  )
  expect(holeFootprint?.fpPads[0]?.size?.width).toBe(1)
  expect(holeFootprint?.fpPads[0]?.size?.height).toBe(1)
  expect(holeFootprint?.fpPads[0]?.drill?.diameter).toBe(1)

  const platedHoleFootprint = parsedPcb?.footprints.find((fp) =>
    fp.libraryLink?.startsWith("tscircuit:platedhole_circle_"),
  )
  expect(platedHoleFootprint?.libraryLink).toBe(
    "tscircuit:platedhole_circle_holeDiameter0.8mm_outerDiameter1.6mm",
  )
  expect(platedHoleFootprint?.fpPads[0]?.size?.width).toBe(1.6)
  expect(platedHoleFootprint?.fpPads[0]?.size?.height).toBe(1.6)
  expect(platedHoleFootprint?.fpPads[0]?.drill?.diameter).toBe(0.8)

  expect(parsedPcb?.vias.length).toBe(1)
  expect(parsedPcb?.vias[0]?.size).toBe(0.8)
  expect(parsedPcb?.vias[0]?.drill).toBe(0.4)
})

test("preserves component Reference designator on custom inline footprints when metadata Reference is empty or REF** (#227)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="U_TEST"
        pcbX={0}
        pcbY={0}
        kicadFootprintMetadata={{
          properties: {
            Reference: {
              value: "",
            },
          },
        }}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="0.6mm"
              height="0.6mm"
              pcbX={-0.95}
              pcbY={-1.3}
              portHints={["1"]}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="0.6mm"
              pcbX={0.95}
              pcbY={-1.3}
              portHints={["2"]}
            />
          </footprint>
        }
        supplierPartNumbers={{ jlcpcb: ["C51118"] }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const output = converter.getOutputString()
  expect(output).toContain('(property "Reference" "U_TEST"')
  expect(output).not.toContain('(property "Reference" ""')
})
