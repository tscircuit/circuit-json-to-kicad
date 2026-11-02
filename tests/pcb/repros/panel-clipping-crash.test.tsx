import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

const PanelClippingRepro = ({ rounded = false }: { rounded?: boolean }) => (
  <panel
    layoutMode="grid"
    row={2}
    col={2}
    boardGap="2mm"
    panelizationMethod="tab-routing"
    tabLength="3mm"
  >
    {Array.from({ length: 4 }, (_, index) => (
      <board
        key={index}
        width="14mm"
        height="18mm"
        borderRadius={rounded ? "2mm" : undefined}
        schematicDisabled
      >
        <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
        <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>
    ))}
  </panel>
)

export default PanelClippingRepro

test("2x2 panel cutouts do not crash polygon clipping", async () => {
  const conversionErrors = []
  for (const rounded of [false, true]) {
    const circuit = new Circuit()
    circuit.add(<PanelClippingRepro rounded={rounded} />)
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    await expect(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
    ).toMatchPngSnapshot(
      import.meta.path,
      rounded ? "panel-clipping-rounded" : "panel-clipping-square",
    )
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    try {
      converter.runUntilFinished()
      expect(converter.getOutputString()).toContain('(layer "Edge.Cuts")')
    } catch (error) {
      conversionErrors.push({ rounded, error: String(error) })
    }
  }
  expect(conversionErrors).toEqual([])
})
