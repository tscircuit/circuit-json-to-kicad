import { expect, test } from "bun:test"
import { Dimension, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("component-owned notes export once with correct rotated coordinates", async () => {
  for (const rotation of [0, 90, 37]) {
    const circuit = new Circuit()
    circuit.add(
      <board width="30mm" height="24mm" routingDisabled>
        <chip
          name="U1"
          pcbX={3}
          pcbY={-2}
          pcbRotation={rotation}
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                pcbX={0}
                pcbY={0}
                width={1}
                height={1}
                shape="rect"
              />
              <pcbnoteline
                x1={-4}
                y1={3}
                x2={4}
                y2={3}
                strokeWidth={0.25}
                isDashed
                layer="bottom"
              />
              <pcbnotepath
                route={[
                  { x: -4, y: 0 },
                  { x: 0, y: 2 },
                  { x: 4, y: 0 },
                ]}
                strokeWidth={0.2}
                layer="bottom"
              />
              <pcbnotedimension
                from={{ x: -4, y: -3 }}
                to={{ x: 4, y: -3 }}
                text="WIDTH"
                fontSize={0.8}
                arrowSize={0.5}
                layer="bottom"
              />
            </footprint>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const json = circuit.getCircuitJson()
    const source = json.find((element) => element.type === "pcb_note_line")!
    expect(source.pcb_component_id).toBeDefined()
    const converter = new CircuitJsonToKicadPcbConverter(json)
    converter.runUntilFinished()
    if (rotation === 37) {
      const snapshot = await takeKicadSnapshot({
        kicadFileContent: converter.getOutputString(),
        kicadFileType: "pcb",
        generatePng: false,
      })
      expect(snapshot.exitCode).toBe(0)
    }
    const pcb = parseKicadPcb(converter.getOutputString())
    const footprint = pcb.footprints[0]!
    expect(footprint.fpLines).toHaveLength(3)
    const dimensions = pcb.otherChildren.filter(
      (child) => child instanceof Dimension,
    )
    expect(dimensions).toHaveLength(1)
    expect(dimensions[0]?.grText?.text).toBe("WIDTH")
    const line = footprint.fpLines[0]!
    expect(line.layer?.names).toEqual(["B.Fab"])
    expect(line.stroke?.width).toBe(0.25)
    expect(line.stroke?.type).toBe("dash")
    // Reconstruct board coordinates from the footprint-local point.
    const theta = (rotation * Math.PI) / 180
    const x =
      footprint.position!.x +
      line.start!.x * Math.cos(theta) +
      line.start!.y * Math.sin(theta)
    const y =
      footprint.position!.y -
      line.start!.x * Math.sin(theta) +
      line.start!.y * Math.cos(theta)
    expect(x).toBeCloseTo(100 + source.x1)
    expect(y).toBeCloseTo(100 - source.y1)
    expect(pcb.graphicPolys).toHaveLength(0)
    expect(pcb.graphicTexts).toHaveLength(0)
    expect(
      pcb.graphicLines.filter((graphic) =>
        graphic.layer?.names.includes("B.Fab"),
      ),
    ).toHaveLength(0)
  }
})
