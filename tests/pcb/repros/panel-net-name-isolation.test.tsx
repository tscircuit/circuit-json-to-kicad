import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativePcbNets } from "../../fixtures/export-native-pcb-nets"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

const BoardCopy = () => (
  <board width="14mm" height="18mm" schematicDisabled>
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
    <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
    <trace from=".R1 > .pin2" to=".C1 > .pin1" />
  </board>
)

export default () => (
  <panel
    layoutMode="grid"
    row={3}
    col={3}
    boardGap="2mm"
    panelizationMethod="tab-routing"
    tabLength="3mm"
  >
    {Array.from({ length: 9 }, (_, index) => (
      <BoardCopy key={index} />
    ))}
  </panel>
)

test("repeated board-local trace names stay separate after KiCad loads the panel", async () => {
  const circuit = new Circuit()
  circuit.add(
    <panel
      layoutMode="grid"
      row={3}
      col={3}
      boardGap="2mm"
      panelizationMethod="tab-routing"
      tabLength="3mm"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <BoardCopy key={index} />
      ))}
    </panel>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const nativeNets = await exportNativePcbNets(converter.getOutputString())

  await expect(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
  ).toMatchPngSnapshot(import.meta.path)
  expect(nativeNets).toMatchSnapshot()
  expect(nativeNets).toHaveLength(9)
  for (const net of nativeNets) expect(net.pins).toHaveLength(2)
})
