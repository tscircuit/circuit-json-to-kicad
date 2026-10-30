import { expect, test } from "bun:test"
import type { CircuitJson, SourcePort } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

type SourceComponent = Extract<
  CircuitJson[number],
  { type: "source_component" }
>

test("repro28: source pin electrical types are preserved in KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        pinLabels={{
          pin1: "INPUT",
          pin2: "OUTPUT",
          pin3: "BIDIRECTIONAL",
          pin4: "TRI_STATE",
          pin5: "OPEN_DRAIN",
          pin6: "OPEN_COLLECTOR",
          pin7: "OPEN_EMITTER",
          pin8: "POWER_IN",
          pin9: "POWER_OUT",
          pin10: "PASSIVE",
        }}
        pinAttributes={{
          INPUT: { isInput: true },
          OUTPUT: { isOutput: true },
          BIDIRECTIONAL: { isBidirectional: true },
          TRI_STATE: { isUsingTriState: true },
          OPEN_DRAIN: { isUsingOpenDrain: true },
          OPEN_COLLECTOR: { isUsingOpenCollector: true },
          OPEN_EMITTER: { isUsingOpenEmitter: true },
          POWER_IN: { requiresPower: true },
          POWER_OUT: { providesPower: true },
          PASSIVE: { isPassive: true },
        }}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: [
              "INPUT",
              "BIDIRECTIONAL",
              "OPEN_DRAIN",
              "POWER_IN",
              "PASSIVE",
            ],
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: [
              "OUTPUT",
              "TRI_STATE",
              "OPEN_COLLECTOR",
              "OPEN_EMITTER",
              "POWER_OUT",
            ],
          },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceComponent = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "U1",
  )
  if (!sourceComponent) throw new Error("Expected U1 source component")

  const sourcePorts = circuitJson.filter(
    (element): element is SourcePort =>
      element.type === "source_port" &&
      element.source_component_id === sourceComponent.source_component_id,
  )
  expect(sourcePorts).toHaveLength(10)
  expect(sourcePorts.find((port) => port.name === "INPUT")?.is_input).toBe(true)
  expect(
    sourcePorts.find((port) => port.name === "OPEN_DRAIN")?.is_using_open_drain,
  ).toBe(true)
  expect(
    sourcePorts.find((port) => port.name === "POWER_OUT")?.provides_power,
  ).toBe(true)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  const u1 = schematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "U1",
    ),
  )
  if (!u1) throw new Error("Expected U1 KiCad symbol")

  const librarySymbol = schematic.libSymbols?.symbols.find(
    (symbol) => symbol.libraryId === u1.libraryId,
  )
  if (!librarySymbol) throw new Error("Expected U1 KiCad library symbol")

  const pinTypes = Object.fromEntries(
    librarySymbol.subSymbols
      .flatMap((symbol) => symbol.pins)
      .map((pin) => [pin.name, pin.pinElectricalType]),
  )
  expect(pinTypes).toMatchInlineSnapshot(`
    {
      "BIDIRECTIONAL": "passive",
      "INPUT": "passive",
      "OPEN_COLLECTOR": "passive",
      "OPEN_DRAIN": "passive",
      "OPEN_EMITTER": "passive",
      "OUTPUT": "passive",
      "PASSIVE": "passive",
      "POWER_IN": "passive",
      "POWER_OUT": "passive",
      "TRI_STATE": "passive",
    }
  `)

  await Bun.write(
    "./debug-output/repro28-pin-electrical-types.kicad_sch",
    output,
  )
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
