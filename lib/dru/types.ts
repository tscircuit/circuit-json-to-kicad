export type RuleAreaTarget =
  | "component"
  | "footprint"
  | "pad"
  | "track"
  | "trace"
  | "via"
  | "zone"
  | "copper_pour"

export interface RuleAreaConstraint {
  type: "outside" | "disallow" | "inside" | string
  clearance?: number | string
}

export interface RuleAreaRule {
  id: string
  targets: RuleAreaTarget[]
  excludeOwner?: boolean
  excludeComponentClasses?: string[]
  excludeRefs?: string[]
  exceptNets?: string[]
  exceptNetClasses?: string[]
  constraint: RuleAreaConstraint
  severity?: "warning" | "error" | string
  description?: string
  [key: string]: any
}

export interface RuleAreaInput {
  type?: "pcb_rule_area" | "pcb_keepout" | "source_rule_area"
  rule_area_id?: string
  pcb_rule_area_id?: string
  pcb_keepout_id?: string
  source_rule_area_id?: string
  name?: string
  description?: string
  shape?: "rect" | "circle" | "polygon" | "outline"
  center?: { x: number; y: number }
  width?: number | string
  height?: number | string
  radius?: number | string
  points?: Array<{ x: number; y: number }>
  outline?: Array<{ x: number; y: number }>
  layers?: string[]
  pcb_component_id?: string
  source_component_id?: string
  is_world_coordinates?: boolean
  is_relative?: boolean
  rules?: RuleAreaRule[]
  subcircuit_id?: string
  [key: string]: any
}

export interface RuleAreaExportDiagnostic {
  rule_area_id: string
  rule_id?: string
  severity: "warning" | "error"
  message: string
}

export interface CircuitJsonToKicadDruOptions {
  ruleAreas?: RuleAreaInput[]
  version?: number
}
