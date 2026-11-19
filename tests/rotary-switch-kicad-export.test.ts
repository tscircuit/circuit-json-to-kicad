import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadPcb, KicadSch, parseKicadSexpr } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "../lib/schematic/CircuitJsonToKicadSchConverter"
import { annotateRotaryBuiltinSymbolPinNumbers } from "../lib/schematic/rotarySwitchKicadSymbol"

function buildRotarySwitchCircuitJson({
  poles,
  positions,
  name = "SW1",
  manufacturerPartNumber,
  includeMountPin = false,
}: {
  poles: number
  positions: number
  name?: string
  manufacturerPartNumber?: string
  includeMountPin?: boolean
}): CircuitJson {
  const totalThrows = poles * positions
  const totalElectricalPins = poles * (positions + 1)
  const elements: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      center: { x: 0, y: 0 },
      width: 40,
      height: 40,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_component",
      source_component_id: "source_rotary_1",
      name,
      ftype: "simple_rotary_switch",
      poles,
      positions,
      ...(manufacturerPartNumber
        ? { manufacturer_part_number: manufacturerPartNumber }
        : {}),
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch_rotary_1",
      source_component_id: "source_rotary_1",
      center: { x: 0, y: 0 },
      size: { width: 2.4, height: 2.2 },
      is_box_with_pins: false,
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_rotary_1",
      source_component_id: "source_rotary_1",
      center: { x: 0, y: 0 },
      width: 26,
      height: 26,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: true,
    },
    {
      type: "source_net",
      source_net_id: "net_common_1",
      name: "AUDIO_IN",
      member_source_group_ids: [],
    },
    {
      type: "source_net",
      source_net_id: "net_throw_1",
      name: "TAP_1",
      member_source_group_ids: [],
    },
  ]

  for (let pinNum = 1; pinNum <= totalElectricalPins; pinNum++) {
    const isCommon = pinNum > totalThrows
    const poleIndex = isCommon
      ? pinNum - totalThrows - 1
      : Math.floor((pinNum - 1) / positions)
    const posIndex = isCommon ? 0 : (pinNum - 1) % positions

    const schX = isCommon ? -1.2 : 1.2
    const schY = isCommon
      ? (poles - 1) * 0.35 - poleIndex * 0.7
      : (totalThrows - 1) * 0.1 - (poleIndex * positions + posIndex) * 0.2

    elements.push(
      {
        type: "source_port",
        source_port_id: `sp_${pinNum}`,
        source_component_id: "source_rotary_1",
        name: `pin${pinNum}`,
        pin_number: pinNum,
        port_hints: [`pin${pinNum}`],
      },
      {
        type: "schematic_port",
        schematic_port_id: `schp_${pinNum}`,
        schematic_component_id: "sch_rotary_1",
        source_port_id: `sp_${pinNum}`,
        center: { x: schX, y: schY },
        facing_direction: isCommon ? "left" : "right",
        pin_number: pinNum,
      },
      {
        type: "pcb_port",
        pcb_port_id: `pcbp_${pinNum}`,
        pcb_component_id: "pcb_rotary_1",
        source_port_id: `sp_${pinNum}`,
        x: isCommon ? -5 : 5,
        y: schY * 5,
        layers: ["top", "bottom"],
      },
      {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: `ph_${pinNum}`,
        pcb_component_id: "pcb_rotary_1",
        pcb_port_id: `pcbp_${pinNum}`,
        shape: "circle",
        x: isCommon ? -5 : 5,
        y: schY * 5,
        outer_diameter: 1.8,
        hole_diameter: 1.0,
        layers: ["top", "bottom"],
      },
    )
  }

  // Connect Pole 1 common (totalThrows + 1) to AUDIO_IN and Throw 1 (pin 1) to TAP_1
  elements.push(
    {
      type: "source_trace",
      source_trace_id: "st_common_1",
      connected_source_port_ids: [`sp_${totalThrows + 1}`],
      connected_source_net_ids: ["net_common_1"],
    },
    {
      type: "source_trace",
      source_trace_id: "st_throw_1",
      connected_source_port_ids: ["sp_1"],
      connected_source_net_ids: ["net_throw_1"],
    },
  )

  if (includeMountPin) {
    elements.push(
      {
        type: "source_port",
        source_port_id: "sp_mp",
        source_component_id: "source_rotary_1",
        name: "MP",
        port_hints: ["MP"],
      },
      {
        type: "schematic_port",
        schematic_port_id: "schp_mp",
        schematic_component_id: "sch_rotary_1",
        source_port_id: "sp_mp",
        center: { x: -1.2, y: -0.6 },
        facing_direction: "left",
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcbp_mp",
        pcb_component_id: "pcb_rotary_1",
        source_port_id: "sp_mp",
        x: -8,
        y: 0,
        layers: ["top", "bottom"],
      },
      {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: "ph_mp",
        pcb_component_id: "pcb_rotary_1",
        pcb_port_id: "pcbp_mp",
        shape: "circle",
        x: -8,
        y: 0,
        outer_diameter: 3.2,
        hole_diameter: 2.0,
        layers: ["top", "bottom"],
      },
    )
  }

  return elements as CircuitJson
}

test("exports 4x3 rotary switch as Switch:SW_Rotary_4x3 with matching KiCad schematic pins and PCB pads", () => {
  const circuitJson = buildRotarySwitchCircuitJson({
    poles: 4,
    positions: 3,
    name: "SW1",
    manufacturerPartNumber: "SR2611-4P3T",
  })

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schText = schConverter.getOutputString()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbText = pcbConverter.getOutputString()

  expect(schText).toContain('(symbol "Switch:SW_Rotary_4x3"')
  expect(schText).toContain('(lib_id "Switch:SW_Rotary_4x3")')
  expect(schText).toContain('(property "Reference" "SW1"')
  expect(schText).toContain('(property "Value" "SR2611-4P3T"')
  expect(schText).toContain('(property "Description" "Rotary switch 4x3"')

  // Parse emitted S-expressions with kicadts to validate structure and pin angles
  const parsedSch = parseKicadSexpr(schText).find(
    (node): node is KicadSch => node instanceof KicadSch,
  )
  expect(parsedSch).toBeDefined()
  const libSym = parsedSch?.libSymbols?.symbols.find(
    (sym) => sym.libraryId === "Switch:SW_Rotary_4x3",
  )
  expect(libSym).toBeDefined()
  expect(libSym?._sxPinNames?.hide).toBe(true)
  expect(libSym?._sxPinNumbers?.hide).toBe(false)

  const drawingUnit = libSym?.subSymbols.find(
    (u) => u.libraryId === "SW_Rotary_4x3_0_1",
  )
  expect(drawingUnit?.circles).toHaveLength(16)

  const pinUnit = libSym?.subSymbols.find(
    (u) => u.libraryId === "SW_Rotary_4x3_1_1",
  )
  expect(pinUnit?.pins).toHaveLength(16)

  // Throws 1..12 face right (KiCad pin angle 180), commons 13..16 face left (KiCad pin angle 0)
  for (let throwPin = 1; throwPin <= 12; throwPin++) {
    const pin = pinUnit?.pins.find(
      (candidate) => candidate._sxNumber?.value === String(throwPin),
    )
    expect(pin, `throw pin ${throwPin}`).toBeDefined()
    expect(pin?.at?.angle).toBe(180)
    expect(schText).toContain(`(pin "${throwPin}"`)
    expect(pcbText).toContain(`(pad "${throwPin}" thru_hole`)
  }

  for (let commonPin = 13; commonPin <= 16; commonPin++) {
    const pin = pinUnit?.pins.find(
      (candidate) => candidate._sxNumber?.value === String(commonPin),
    )
    expect(pin, `common pin ${commonPin}`).toBeDefined()
    expect(pin?.at?.angle).toBe(0)
    expect(schText).toContain(`(pin "${commonPin}"`)
    expect(pcbText).toContain(`(pad "${commonPin}" thru_hole`)
  }

  const parsedPcb = parseKicadSexpr(pcbText).find(
    (node): node is KicadPcb => node instanceof KicadPcb,
  )
  expect(parsedPcb).toBeDefined()
  expect(pcbText).toContain('"AUDIO_IN"')
  expect(pcbText).toContain('"TAP_1"')
})

test("exports 1x3 rotary switch with MP mount port as Switch:SW_Rotary_1x3_MP and SW? fallback reference", () => {
  const circuitJson = buildRotarySwitchCircuitJson({
    poles: 1,
    positions: 3,
    name: "",
    includeMountPin: true,
  })

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schText = schConverter.getOutputString()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbText = pcbConverter.getOutputString()

  expect(schText).toContain('(symbol "Switch:SW_Rotary_1x3_MP"')
  expect(schText).toContain('(property "Reference" "SW?"')
  expect(schText).toContain('(property "Value" "SW_Rotary_1x3_MP"')
  expect(schText).toContain('(number "MP"')
  expect(schText).toContain('(pin "MP"')
  expect(pcbText).toContain('(pad "MP" thru_hole')
  for (const pin of ["1", "2", "3", "4"]) {
    expect(schText).toContain(`(number "${pin}"`)
    expect(pcbText).toContain(`(pad "${pin}" thru_hole`)
  }
})

test("annotates builtin rotary_switch symbol ports with explicit SW_Rotary_NxM pinNumbers", () => {
  const annotated = annotateRotaryBuiltinSymbolPinNumbers(
    {
      ports: [
        { x: -0.9, y: 0.47, labels: ["13", "common1", "pole1"] },
        { x: -0.9, y: -0.47, labels: ["14", "common2", "pole2"] },
        { x: 0.9, y: 0.82, labels: ["1", "p1_pos1"] },
        { x: 0.9, y: -0.82, labels: ["12", "p2_pos6"] },
      ],
    },
    {
      poles: 2,
      positions: 6,
      hasMountPin: false,
      kicadSymbolName: "SW_Rotary_2x6",
    },
  )

  expect(annotated.ports.map((p) => p.pinNumber)).toEqual([
    "13",
    "14",
    "1",
    "12",
  ])
})
