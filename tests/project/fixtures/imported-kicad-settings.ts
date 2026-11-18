import type { CircuitJson } from "circuit-json"

export const netSettings = {
  meta: { version: 4 },
  last_net_id: 19,
  classes: [
    { name: "Default", track_width: 0.2, priority: 2147483647 },
    { name: "Power", track_width: 0.8, clearance: 0.3, priority: 1 },
    { name: "Sense", track_width: 0.8, priority: 2 },
    { name: "Inherited", priority: 0 },
    { name: "Unused", track_width: 0.4, via_diameter: 0.7, priority: 3 },
  ],
  netclass_assignments: {
    "/POWER/VCC+": ["Inherited", "Power"],
    "SENSE[0]": ["Sense"],
  },
  netclass_patterns: [{ netclass: "Sense", pattern: "SENSE*" }],
  future_kicad_setting: { preserve: true },
}

export const circuitJson: CircuitJson = [
  {
    type: "source_project_metadata",
    metadata: { kicad_project: { net_settings: netSettings } },
  },
  {
    type: "pcb_board",
    pcb_board_id: "board",
    center: { x: 0, y: 0 },
    width: 20,
    height: 12,
    num_layers: 2,
    thickness: 1.6,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "vcc",
    name: "POWER_VCC_P",
    member_source_group_ids: [],
    trace_width: 0.8,
    metadata: {
      kicad_net: { name: "/POWER/VCC+", circuit_json_name: "POWER_VCC_P" },
    },
  },
  {
    type: "source_net",
    source_net_id: "sense",
    name: "SENSE_0",
    member_source_group_ids: [],
    trace_width: 0.8,
    metadata: {
      kicad_net: { name: "SENSE[0]", circuit_json_name: "SENSE_0" },
    },
  },
  {
    type: "source_trace",
    source_trace_id: "power_trace",
    subcircuit_connectivity_map_key: "vcc",
    connected_source_port_ids: [],
    connected_source_net_ids: ["vcc"],
  },
  {
    type: "source_trace",
    source_trace_id: "sense_trace",
    subcircuit_connectivity_map_key: "sense",
    connected_source_port_ids: [],
    connected_source_net_ids: ["sense"],
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "power_copper",
    source_trace_id: "power_trace",
    route: [
      { route_type: "wire", x: -5, y: 2, layer: "top", width: 0.8 },
      { route_type: "wire", x: 5, y: 2, layer: "top", width: 0.8 },
    ],
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "sense_copper",
    source_trace_id: "sense_trace",
    route: [
      { route_type: "wire", x: -5, y: -2, layer: "top", width: 0.8 },
      { route_type: "wire", x: 5, y: -2, layer: "top", width: 0.8 },
    ],
  },
]
