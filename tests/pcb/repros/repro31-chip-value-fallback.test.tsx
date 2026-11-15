import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("chip without a manufacturer part number falls back to its name for Value", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip name="U1" footprint="soic8" pcbX={-5} pcbY={0} />
      <chip
        name="U2"
        footprint="soic8"
        manufacturerPartNumber="AT42QT1011-TSHR"
        pcbX={5}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const valueOf = (reference: string) =>
    kicadPcb.footprints
      .find(
        (footprint) =>
          footprint.properties?.find((property) => property.key === "Reference")
            ?.value === reference,
      )
      ?.properties?.find((property) => property.key === "Value")?.value

  // An empty Value is what KiCad's Specctra DSN export rejects with
  // "Footprint with value of '' has an empty reference designator".
  expect(valueOf("U1")).toBe("U1")
  expect(valueOf("U2")).toBe("AT42QT1011-TSHR")
})
