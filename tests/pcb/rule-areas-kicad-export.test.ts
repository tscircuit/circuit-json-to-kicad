import { describe, expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  convertCircuitJsonToKicadDru,
} from "../../lib"

describe("KiCad Rule Areas and Custom Rules (.kicad_dru) Export (tscircuit#4991)", () => {
  // Fixture 1 & 2: MP connector-access advisory rule area with class and owner exemptions
  test("Fixture 1 & 2: Exports named rule area zone to .kicad_pcb and scoped custom rule to .kicad_dru", () => {
    const circuitJson: CircuitJson = [
      {
        type: "source_component",
        source_component_id: "src_mp1",
        name: "MP1",
        ftype: "simple_chip",
        component_classes: ["machine-pin"],
      } as any,
      {
        type: "pcb_component",
        pcb_component_id: "pcb_mp1",
        source_component_id: "src_mp1",
        center: { x: 0, y: 0 },
        layer: "top",
      },
      {
        type: "pcb_rule_area",
        pcb_rule_area_id: "ra_mp1",
        name: "connector-access",
        pcb_component_id: "pcb_mp1",
        shape: "rect",
        width: 4,
        height: 4,
        layers: ["top", "bottom"],
        rules: [
          {
            id: "component-access",
            targets: ["component", "pad"],
            excludeOwner: true,
            excludeComponentClasses: ["machine-pin", "machine-contact"],
            constraint: { type: "outside", clearance: "0.2mm" },
            severity: "warning",
          },
        ],
      } as any,
    ]

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const pcbStr = converter.getOutputString()
    expect(pcbStr).toContain("connector-access")
    // Because the rule is advisory with exemptions and clearance, basic keepout allows them
    // so .kicad_dru custom rules govern
    expect(pcbStr).toContain("(footprints allowed)")
    expect(pcbStr).toContain("(pads allowed)")

    const druStr = converter.getKicadDruString()
    expect(druStr).toContain("(version 1)")
    expect(druStr).toContain('(rule "connector-access_component-access"')
    expect(druStr).toContain("A.intersectsArea('connector-access')")
    expect(druStr).toContain("(A.Type == 'Footprint' || A.Type == 'Pad')")
    expect(druStr).toContain("!A.memberOfFootprint('MP1')")
    expect(druStr).toContain("A.Reference != 'MP1'")
    expect(druStr).toContain("!A.hasComponentClass('machine-pin')")
    expect(druStr).toContain("!A.hasComponentClass('machine-contact')")
    expect(druStr).toContain('(constraint clearance (min "0.2mm"))')
    expect(druStr).toContain("(severity warning)")
  })

  // Fixture 4: Track and via restrictions, with net exemptions
  test("Fixture 4: Unconditional via restriction and net-filtered track restriction", () => {
    const circuitJson: CircuitJson = [
      {
        type: "pcb_rule_area",
        pcb_rule_area_id: "ra_forbidden",
        name: "high_voltage_keepout",
        shape: "rect",
        center: { x: 10, y: 10 },
        width: 6,
        height: 6,
        layers: ["top"],
        is_world_coordinates: true,
        rules: [
          {
            id: "no-vias",
            targets: ["via"],
            constraint: { type: "outside" },
            severity: "error",
          },
          {
            id: "assigned-net-only",
            targets: ["track"],
            exceptNets: ["net.GND"],
            constraint: { type: "outside" },
            severity: "error",
          },
        ],
      } as any,
    ]

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const pcbStr = converter.getOutputString()
    expect(pcbStr).toContain("high_voltage_keepout")
    // Unconditional via error -> basic keepout blocks vias natively
    expect(pcbStr).toContain("(vias not_allowed)")
    // Conditioned track rule -> basic keepout allows tracks so .kicad_dru rule scopes it
    expect(pcbStr).toContain("(tracks allowed)")

    const druStr = converter.getKicadDruString()
    expect(druStr).toContain('(rule "high_voltage_keepout_no-vias"')
    expect(druStr).toContain("A.Type == 'Via'")
    expect(druStr).toContain("(constraint disallow)")
    expect(druStr).toContain("(severity error)")

    expect(druStr).toContain('(rule "high_voltage_keepout_assigned-net-only"')
    expect(druStr).toContain("A.Type == 'Track'")
    expect(druStr).toContain("A.NetName != 'net.GND'")
    expect(druStr).toContain("A.NetName != 'GND'")
  })

  // Fixture 5: Ordering of error and warning rules in .kicad_dru
  test("Fixture 5: Compiles error rules before warning rules so hard rules are not downgraded", () => {
    const circuitJson: CircuitJson = [
      {
        type: "pcb_rule_area",
        pcb_rule_area_id: "ra_mixed",
        name: "mixed_area",
        shape: "circle",
        center: { x: 0, y: 0 },
        radius: 3,
        layers: ["top"],
        rules: [
          {
            id: "advisory_rule",
            targets: ["pad"],
            constraint: { type: "outside" },
            severity: "warning",
          },
          {
            id: "hard_rule",
            targets: ["track"],
            constraint: { type: "outside" },
            severity: "error",
          },
        ],
      } as any,
    ]

    const druStr = convertCircuitJsonToKicadDru(circuitJson)
    const hardRuleIndex = druStr.indexOf('rule "mixed_area_hard_rule"')
    const advisoryRuleIndex = druStr.indexOf('rule "mixed_area_advisory_rule"')

    expect(hardRuleIndex).toBeGreaterThan(-1)
    expect(advisoryRuleIndex).toBeGreaterThan(-1)
    // Hard error rule must appear BEFORE advisory warning rule
    expect(hardRuleIndex).toBeLessThan(advisoryRuleIndex)
  })

  // Fixture 6: Rotated and bottom-layer component-owned rule area
  test("Fixture 6: Component-owned rule area transforms correctly when rotated and on bottom layer", () => {
    const circuitJson: CircuitJson = [
      {
        type: "pcb_component",
        pcb_component_id: "comp_bottom",
        center: { x: 50, y: 40 },
        rotation: 90,
        layer: "bottom",
      },
      {
        type: "pcb_rule_area",
        pcb_rule_area_id: "ra_bottom",
        name: "bottom_sensor_keepout",
        pcb_component_id: "comp_bottom",
        shape: "rect",
        width: 6,
        height: 2,
        layers: ["bottom"],
        rules: [
          {
            id: "clearance_rule",
            targets: ["component"],
            constraint: { type: "outside", clearance: "0.5mm" },
            severity: "error",
          },
        ],
      } as any,
    ]

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const pcbStr = converter.getOutputString()
    expect(pcbStr).toContain("bottom_sensor_keepout")
    expect(pcbStr).toContain("B.Cu")

    const druStr = converter.getKicadDruString()
    expect(druStr).toContain('(rule "bottom_sensor_keepout_clearance_rule"')
    expect(druStr).toContain('(layer "B.Cu")')
    expect(druStr).toContain('(constraint clearance (min "0.5mm"))')
  })

  // Fixture 8: Diagnoses unsupported rules explicitly
  test("Fixture 8: Produces explicit diagnostic for unsupported rule callback predicates", () => {
    const circuitJson: CircuitJson = [
      {
        type: "pcb_rule_area",
        pcb_rule_area_id: "ra_callback",
        name: "callback_area",
        shape: "rect",
        width: 2,
        height: 2,
        layers: ["top"],
        rules: [
          {
            id: "custom_cb",
            targets: ["pad"],
            callback: () => false,
            constraint: { type: "outside" },
            severity: "error",
          },
        ],
      } as any,
    ]

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const diagnostics = converter.getRuleAreaExportDiagnostics()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.severity).toBe("error")
    expect(diagnostics[0]?.message).toContain("custom JavaScript callbacks")
  })
})
