import { expect, test } from "bun:test"
import type {
  CircuitJson,
  PcbComponent,
  PcbSmtPad,
  PcbSolderPaste,
} from "circuit-json"
import { KicadPcb, type FootprintPad } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const convertAndParse = (circuitJson: CircuitJson) => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  return KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
}

const component: PcbComponent = {
  type: "pcb_component",
  pcb_component_id: "pcb_component_contact",
  source_component_id: "source_component_contact",
  center: { x: 10, y: 20 },
  width: 20,
  height: 20,
  layer: "top",
  rotation: 0,
  obstructs_within_bounds: true,
}

const copperPad: PcbSmtPad = {
  type: "pcb_smtpad",
  pcb_smtpad_id: "pcb_smtpad_contact",
  pcb_component_id: component.pcb_component_id,
  pcb_port_id: "pcb_port_contact",
  port_hints: ["pin7"],
  shape: "circle",
  x: 10,
  y: 20,
  radius: 10,
  layer: "top",
}

const isPastePad = (pad: FootprintPad) =>
  pad.layers?.layers.some((layer) => layer.endsWith(".Paste")) ?? false

const expectPasteOnly = (pad: FootprintPad, layer: "top" | "bottom") => {
  expect(pad.layers?.layers).toEqual([layer === "top" ? "F.Paste" : "B.Paste"])
  expect(pad.number).toBe("")
  expect(pad.padType).toBe("smd")
  expect(pad.net).toBeUndefined()
  expect(pad.drill).toBeUndefined()
}

test("four paste windows preserve one continuous copper contact and its net", () => {
  const windows: PcbSolderPaste[] = [
    [7, 17],
    [13, 17],
    [7, 23],
    [13, 23],
  ].map(([x, y], index) => ({
    type: "pcb_solder_paste",
    pcb_solder_paste_id: `pcb_solder_paste_window_${index}`,
    pcb_component_id: component.pcb_component_id,
    shape: "rect",
    x: x!,
    y: y!,
    width: 4,
    height: 3,
    layer: "top",
  }))
  const pcb = convertAndParse([
    component,
    copperPad,
    {
      type: "source_net",
      source_net_id: "source_net_contact",
      name: "CONTACT",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: "contact_net",
    },
    {
      type: "source_port",
      source_port_id: "source_port_contact",
      source_component_id: component.source_component_id,
      name: "CONTACT",
      pin_number: 7,
      subcircuit_connectivity_map_key: "contact_net",
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_port_contact",
      source_port_id: "source_port_contact",
      pcb_component_id: component.pcb_component_id,
      x: 10,
      y: 20,
      layers: ["top"],
    },
    ...windows,
  ])

  expect(pcb.footprints).toHaveLength(1)
  const pads = pcb.footprints[0]!.fpPads
  expect(pads).toHaveLength(5)
  const conductivePads = pads.filter((pad) =>
    pad.layers?.layers.some((layer) => layer.endsWith(".Cu")),
  )
  expect(conductivePads).toHaveLength(1)
  const contact = conductivePads[0]!
  expect(pads[0]).toBe(contact)
  expect(contact.number).toBe("7")
  expect(contact.shape).toBe("circle")
  expect(contact.size?.width).toBe(20)
  expect(contact.size?.height).toBe(20)
  expect(contact.layers?.layers).toEqual(["F.Cu", "F.Mask"])
  expect(contact.net?.name).toBe("CONTACT")

  const apertures = pads.filter(isPastePad)
  expect(apertures).toHaveLength(4)
  for (const aperture of apertures) {
    expectPasteOnly(aperture, "top")
    expect(aperture.shape).toBe("rect")
    expect(aperture.size?.width).toBe(4)
    expect(aperture.size?.height).toBe(3)
  }
  expect(apertures.map((pad) => [pad.at?.x, pad.at?.y])).toEqual([
    [-3, 3],
    [3, 3],
    [-3, -3],
    [3, -3],
  ])
})

test("component paste retains board positions and angles on both layers", () => {
  // Circuit JSON is board-space mm (+X right, +Y up); KiCad footprint
  // coordinates are local mm (+X right, +Y down). These asymmetric expected
  // positions pin all four cardinal rotations without repeating converter math.
  const placements = [
    { rotation: 0, local: [3, -5] },
    { rotation: 90, local: [5, 3] },
    { rotation: 180, local: [-3, 5] },
    { rotation: 270, local: [-5, -3] },
  ]
  for (const layer of ["top", "bottom"] as const) {
    for (const { rotation, local } of placements) {
      const paste: PcbSolderPaste = {
        type: "pcb_solder_paste",
        pcb_solder_paste_id: "pcb_solder_paste_rotated",
        pcb_component_id: component.pcb_component_id,
        shape: "rotated_rect",
        x: 13,
        y: 25,
        width: 4,
        height: 1.5,
        ccw_rotation: 30,
        layer,
      }
      const pcb = convertAndParse([{ ...component, rotation, layer }, paste])
      expect(pcb.footprints).toHaveLength(1)
      const footprint = pcb.footprints[0]!
      expect(footprint.position?.x).toBe(110)
      expect(footprint.position?.y).toBe(80)
      expect(footprint.fpPads).toHaveLength(1)
      const aperture = footprint.fpPads[0]!
      expectPasteOnly(aperture, layer)
      expect(aperture.at?.x).toBeCloseTo(local[0]!, 5)
      expect(aperture.at?.y).toBeCloseTo(local[1]!, 5)
      expect(aperture.at?.angle).toBe(30)
      expect(aperture.size?.width).toBe(4)
      expect(aperture.size?.height).toBe(1.5)
    }
  }
})

test("standalone paste preserves every supported aperture shape and side", () => {
  const shapes: PcbSolderPaste[] = [
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_circle",
      shape: "circle",
      x: -8,
      y: 2,
      radius: 0.75,
      layer: "bottom",
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_rect",
      shape: "rect",
      x: -4,
      y: 3,
      width: 2,
      height: 1,
      layer: "top",
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_pill",
      shape: "pill",
      x: 0,
      y: 4,
      width: 3,
      height: 1,
      radius: 0.25,
      layer: "bottom",
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_rotated_pill",
      shape: "rotated_pill",
      x: 4,
      y: 5,
      width: 2,
      height: 1,
      radius: 0.5,
      ccw_rotation: 45,
      layer: "top",
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_oval",
      shape: "oval",
      x: 8,
      y: 6,
      width: 1.5,
      height: 3,
      layer: "bottom",
    },
  ]
  const pcb = convertAndParse(shapes)
  expect(pcb.footprints).toHaveLength(5)
  const expectedShapes = ["circle", "rect", "roundrect", "roundrect", "oval"]
  const expectedWidths = [1.5, 2, 3, 2, 1.5]
  const expectedHeights = [1.5, 1, 1, 1, 3]
  shapes.forEach((source, index) => {
    const footprint = pcb.footprints.find(
      (footprint) => footprint.position?.x === 100 + source.x,
    )!
    expect(footprint).toBeDefined()
    expect(footprint.position?.y).toBe(100 - source.y)
    expect(footprint.attr?.boardOnly).toBe(true)
    expect(footprint.attr?.excludeFromBom).toBe(true)
    expect(footprint.attr?.excludeFromPosFiles).toBe(true)
    expect(footprint.fpPads).toHaveLength(1)
    const aperture = footprint.fpPads[0]!
    expectPasteOnly(aperture, source.layer as "top" | "bottom")
    expect(aperture.at?.x).toBe(0)
    expect(aperture.at?.y).toBe(0)
    expect(aperture.shape).toBe(expectedShapes[index]!)
    expect(aperture.size?.width).toBe(expectedWidths[index])
    expect(aperture.size?.height).toBe(expectedHeights[index])
    if (source.shape === "rotated_pill") {
      expect(aperture.at?.angle).toBe(45)
      expect(aperture.roundrectRatio).toBe(0.5)
    } else if (source.shape === "pill") {
      expect(aperture.roundrectRatio).toBe(0.25)
    }
  })
})

test("paste ownership follows a linked pad and orphan references stay visible", () => {
  const linked: PcbSolderPaste = {
    type: "pcb_solder_paste",
    pcb_solder_paste_id: "paste_linked",
    pcb_smtpad_id: copperPad.pcb_smtpad_id,
    shape: "circle",
    x: 10,
    y: 20,
    radius: 7,
    layer: "top",
  }
  const orphan: PcbSolderPaste = {
    ...linked,
    pcb_solder_paste_id: "paste_orphan",
    pcb_component_id: "missing_component",
    pcb_smtpad_id: "missing_pad",
    x: 30,
    y: -10,
    radius: 0.5,
  }
  const pcb = convertAndParse([component, copperPad, linked, orphan])
  expect(pcb.footprints).toHaveLength(2)
  const contactFootprint = pcb.footprints.find((footprint) =>
    footprint.fpPads.some((pad) => pad.number === "7"),
  )!
  expect(contactFootprint.fpPads).toHaveLength(2)
  const linkedAperture = contactFootprint.fpPads.find(isPastePad)!
  expectPasteOnly(linkedAperture, "top")
  expect(linkedAperture.size?.width).toBe(14)
  expect(contactFootprint.fpPads[0]!.layers?.layers).toEqual(["F.Cu", "F.Mask"])
  const orphanFootprint = pcb.footprints.find(
    (footprint) => footprint !== contactFootprint,
  )!
  expect(orphanFootprint.position?.x).toBe(130)
  expect(orphanFootprint.position?.y).toBe(110)
  expect(orphanFootprint.fpPads).toHaveLength(1)
  expectPasteOnly(orphanFootprint.fpPads[0]!, "top")
})

test("legacy circuits retain implicit paste and covered pads keep it suppressed", () => {
  for (const layer of ["top", "bottom"] as const) {
    for (const covered of [false, true]) {
      const pcb = convertAndParse([
        {
          ...copperPad,
          pcb_component_id: undefined,
          pcb_port_id: undefined,
          layer,
          is_covered_with_solder_mask: covered,
        },
      ])
      expect(pcb.footprints).toHaveLength(1)
      const pads = pcb.footprints[0]!.fpPads
      expect(pads).toHaveLength(1)
      const side = layer === "top" ? "F" : "B"
      expect(pads[0]!.layers?.layers).toEqual([
        `${side}.Cu`,
        ...(covered ? [] : [`${side}.Paste`]),
        `${side}.Mask`,
      ])
    }
  }
})

test("same-position apertures have distinct stable identities without extra nets", () => {
  const first: PcbSolderPaste = {
    type: "pcb_solder_paste",
    pcb_solder_paste_id: "paste_first",
    pcb_component_id: component.pcb_component_id,
    shape: "rect",
    x: 10,
    y: 20,
    width: 2,
    height: 1,
    layer: "top",
  }
  const second: PcbSolderPaste = {
    ...first,
    pcb_solder_paste_id: "paste_second",
    layer: "bottom",
  }
  const input = [component, first, second]
  const pcb = convertAndParse(input)
  const pads = pcb.footprints.flatMap((footprint) => footprint.fpPads)
  expect(pads).toHaveLength(2)
  const ids = pads.map((pad) => pad.uuid?.value)
  expect(ids.every(Boolean)).toBe(true)
  expect(new Set(ids).size).toBe(2)
  expect(
    convertAndParse(input).footprints.flatMap((footprint) =>
      footprint.fpPads.map((pad) => pad.uuid?.value),
    ),
  ).toEqual(ids)
  expect(pcb.nets).toHaveLength(1)
  for (const pad of pads) {
    expect(pad.net).toBeUndefined()
    expect(pad.number).toBe("")
    expect(pad.drill).toBeUndefined()
  }
})
