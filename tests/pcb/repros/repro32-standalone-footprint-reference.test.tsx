import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("standalone holes and pads export with a reference designator", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      {/* Claims H1, so the first hole has to skip to H2. */}
      <chip name="H1" footprint="soic8" pcbX={0} pcbY={0} />
      <hole pcbX={-20} pcbY={-20} diameter="3.2mm" />
      <hole pcbX={20} pcbY={-20} diameter="3.2mm" />
      <platedhole
        pcbX={-20}
        pcbY={20}
        holeDiameter="1mm"
        outerDiameter="2mm"
        shape="circle"
      />
      <smtpad pcbX={20} pcbY={20} shape="rect" width="1mm" height="1mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const propertyOf = (footprint: any, key: string) =>
    footprint.properties?.find((property: any) => property.key === key)?.value

  // KiCad's Specctra DSN export (what the freerouting plugin runs) refuses the
  // whole board if any footprint is missing its reference designator.
  for (const footprint of kicadPcb.footprints) {
    expect([
      footprint.libraryLink,
      propertyOf(footprint, "Reference"),
    ]).not.toEqual([footprint.libraryLink, undefined])
    expect([
      footprint.libraryLink,
      propertyOf(footprint, "Reference"),
    ]).not.toEqual([footprint.libraryLink, ""])
  }

  const standaloneReferences = kicadPcb.footprints
    .filter((footprint) => !footprint.libraryLink?.includes("soic8"))
    .map((footprint) => propertyOf(footprint, "Reference"))
    .sort()
  expect(standaloneReferences).toEqual(["H2", "H3", "H4", "PAD1"])

  const hole = kicadPcb.footprints.find((footprint) =>
    footprint.libraryLink?.includes("hole_circle"),
  )
  // KiCad's own MountingHole footprints put the footprint name in Value.
  expect(propertyOf(hole, "Value")).toBe("hole_circle_holeDiameter3.2mm")
})
