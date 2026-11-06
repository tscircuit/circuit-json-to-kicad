import { expect, test } from "bun:test"
import { pcb_board } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("exports board thickness in millimeters with a fallback for missing thickness", async () => {
  // The length schema accepts zero and negative numbers; preserve them rather
  // than introducing exporter-specific validation or a truthiness fallback.
  for (const thickness of [
    0.8,
    1.2,
    2,
    1.6,
    0,
    -0.1,
    "1.2mm",
    undefined,
  ] as const) {
    const circuit = new Circuit()
    circuit.add(
      <board width={10} height={10} thickness={thickness} routingDisabled />,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const board = circuitJson.find((element) => element.type === "pcb_board")!
    const expectedThickness =
      thickness === undefined ? 1.4 : thickness === "1.2mm" ? 1.2 : thickness
    expect(pcb_board.parse(board).thickness).toBe(expectedThickness)

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const parsed = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
    expect(parsed.general?.thickness).toBe(expectedThickness)

    // Older CircuitJSON may omit thickness without applying the schema default.
    const withoutThickness = circuitJson.map((element) => {
      if (element.type !== "pcb_board") return element
      const { thickness: _thickness, ...rest } = element
      return rest
    }) as typeof circuitJson
    const fallbackConverter = new CircuitJsonToKicadPcbConverter(
      withoutThickness,
    )
    fallbackConverter.runUntilFinished()
    const fallbackParsed = KicadPcb.parse(
      fallbackConverter.getOutputString(),
    )[0] as KicadPcb
    expect(fallbackParsed.general?.thickness).toBe(1.6)
  }

  const noBoardConverter = new CircuitJsonToKicadPcbConverter([])
  noBoardConverter.runUntilFinished()
  const noBoardParsed = KicadPcb.parse(
    noBoardConverter.getOutputString(),
  )[0] as KicadPcb
  expect(noBoardParsed.general?.thickness).toBe(1.6)
})
