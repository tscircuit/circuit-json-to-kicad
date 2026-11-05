import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"
import { Footprint, parseKicadSch } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { selectSchematicPaperSize } from "lib/schematic/selectSchematicPaperSize"

test("different anonymous inline footprints remain separate library entries", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20}>
      <chip
        name="U1"
        pcbX={-5}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              shape="rect"
              width={1}
              height={1}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
      />
      <chip
        name="U2"
        pcbX={5}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              shape="rect"
              width={3}
              height={2}
              pcbX={0}
              pcbY={0}
            />
            <smtpad
              portHints={["pin2"]}
              shape="rect"
              width={1}
              height={1}
              pcbX={4}
              pcbY={0}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const input = circuit.getCircuitJson()
  expect(input.filter((e) => e.type === "pcb_component")).toHaveLength(2)
  const pcb = new CircuitJsonToKicadPcbConverter(input)
  pcb.runUntilFinished()
  expect(
    pcb
      .getOutput()
      .footprints.map((fp) => fp.fpPads.filter((p) => p.number !== "").length)
      .sort(),
  ).toEqual([1, 2])
  const converter = new CircuitJsonToKicadLibraryConverter(input)
  converter.runUntilFinished()
  const entries = converter.getFootprints()
  const padCounts = entries
    .map(
      (entry) =>
        (Footprint.parse(entry.kicadModString)[0] as Footprint).fpPads.filter(
          (p) => p.number !== "",
        ).length,
    )
    .sort()
  expect(padCounts).toEqual([1, 2])
  expect(new Set(entries.map((entry) => entry.footprintName)).size).toBe(2)

  // Verify symbol footprint references match extracted footprint names
  const symString = converter.getSymbolLibraryString()
  for (const entry of entries) {
    expect(symString).toContain(`"tscircuit:${entry.footprintName}"`)
  }
})

test("selectSchematicPaperSize selects portrait ISO or custom User sheet when exceeding landscape A0", () => {
  const tallSheet = selectSchematicPaperSize(800, 1100)
  expect(tallSheet.width).toBeGreaterThanOrEqual(840)
  expect(tallSheet.height).toBeGreaterThanOrEqual(1140)
  expect(tallSheet).toEqual({
    name: "A0",
    width: 841,
    height: 1189,
    isPortrait: true,
  })

  const oversizedSheet = selectSchematicPaperSize(1300, 1200)
  expect(oversizedSheet.name).toBe("User")
  expect(oversizedSheet.width).toBeGreaterThanOrEqual(1340)
  expect(oversizedSheet.height).toBeGreaterThanOrEqual(1240)
  expect(oversizedSheet.customSize).toEqual({
    width: 1340,
    height: 1240,
  })
})

test("tall single-sheet schematic exports within selected sheet bounds without clipping", () => {
  // Coordinates that exceed landscape A0 height (841mm) but fit portrait A0 (841x1189mm)
  const spanX = 600 / 15
  const spanY = 900 / 15
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "sc_top",
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch_top",
      source_component_id: "sc_top",
      center: { x: -spanX / 2, y: spanY / 2 },
      rotation: 0,
      size: { width: 1, height: 0.5 },
    },
    {
      type: "source_component",
      source_component_id: "sc_bottom",
      name: "R2",
      ftype: "simple_resistor",
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch_bottom",
      source_component_id: "sc_bottom",
      center: { x: spanX / 2, y: -spanY / 2 },
      rotation: 0,
      size: { width: 1, height: 0.5 },
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = parseKicadSch(converter.getOutputString())

  const paperWidth = converter.ctx.schematicPaperSize!.width
  const paperHeight = converter.ctx.schematicPaperSize!.height
  expect(sch.paper?.size).toBe("A0")
  expect(sch.paper?.isPortrait).toBe(true)

  for (const placedSymbol of sch.symbols) {
    const x = placedSymbol.at?.x ?? 0
    const y = placedSymbol.at?.y ?? 0
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(paperWidth)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(paperHeight)
  }
})
