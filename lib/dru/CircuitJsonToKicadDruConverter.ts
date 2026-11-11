import type { CircuitJson, PcbComponent } from "circuit-json"
import { getKicadLayer } from "../pcb/utils/layerMapping"
import type {
  CircuitJsonToKicadDruOptions,
  RuleAreaExportDiagnostic,
  RuleAreaInput,
} from "./types"

function parseDimension(
  val: number | string | undefined,
  defaultVal = 0,
): number {
  if (typeof val === "number") return val
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase()
    if (trimmed.endsWith("mm")) {
      return parseFloat(trimmed.slice(0, -2))
    }
    if (trimmed.endsWith("um")) {
      return parseFloat(trimmed.slice(0, -2)) / 1000
    }
    if (trimmed.endsWith("in") || trimmed.endsWith("inch")) {
      return parseFloat(trimmed) * 25.4
    }
    const parsed = parseFloat(trimmed)
    return Number.isNaN(parsed) ? defaultVal : parsed
  }
  return defaultVal
}

interface CompiledDruRule {
  name: string
  description?: string
  layer?: string
  condition: string
  constraint: string
  severity: "error" | "warning"
}

export class CircuitJsonToKicadDruConverter {
  circuitJson: CircuitJson
  options?: CircuitJsonToKicadDruOptions
  diagnostics: RuleAreaExportDiagnostic[] = []

  constructor(
    circuitJson: CircuitJson,
    options?: CircuitJsonToKicadDruOptions,
  ) {
    this.circuitJson = circuitJson
    this.options = options
  }

  private collectRuleAreas(): RuleAreaInput[] {
    const areas: RuleAreaInput[] = []

    for (const el of this.circuitJson) {
      if ((el as any).type === "pcb_rule_area") {
        areas.push(el as any as RuleAreaInput)
      } else if ((el as any).type === "source_rule_area") {
        const sourceArea = el as any
        const pcbComp = sourceArea.source_component_id
          ? (this.circuitJson.find(
              (e) =>
                e.type === "pcb_component" &&
                e.source_component_id === sourceArea.source_component_id,
            ) as PcbComponent | undefined)
          : undefined
        areas.push({
          ...sourceArea,
          rule_area_id:
            sourceArea.rule_area_id ?? sourceArea.source_rule_area_id,
          pcb_component_id:
            pcbComp?.pcb_component_id ?? sourceArea.pcb_component_id,
        })
      } else if (
        el.type === "pcb_keepout" &&
        Array.isArray((el as any).rules) &&
        (el as any).rules.length > 0
      ) {
        areas.push({
          ...(el as any),
          rule_area_id: (el as any).rule_area_id ?? el.pcb_keepout_id,
        })
      }
    }

    if (this.options?.ruleAreas?.length) {
      areas.push(...this.options.ruleAreas)
    }

    return areas
  }

  public getDiagnostics(): RuleAreaExportDiagnostic[] {
    // Generate rules to populate diagnostics
    this.getOutputDru()
    return this.diagnostics
  }

  public getOutputDru(): string {
    this.diagnostics = []
    const ruleAreas = this.collectRuleAreas()
    if (ruleAreas.length === 0) {
      return "(version 1)\n"
    }

    const compiledRules: CompiledDruRule[] = []

    for (let areaIdx = 0; areaIdx < ruleAreas.length; areaIdx++) {
      const ra = ruleAreas[areaIdx]!
      const raId =
        ra.rule_area_id ??
        ra.pcb_rule_area_id ??
        ra.pcb_keepout_id ??
        `rule_area_${areaIdx + 1}`
      const areaName = ra.name ?? raId

      // Find owner component and its reference designator
      let ownerRef: string | undefined
      const ownerPcbComp = ra.pcb_component_id
        ? (this.circuitJson.find(
            (e) =>
              e.type === "pcb_component" &&
              e.pcb_component_id === ra.pcb_component_id,
          ) as PcbComponent | undefined)
        : ra.source_component_id
          ? (this.circuitJson.find(
              (e) =>
                e.type === "pcb_component" &&
                e.source_component_id === ra.source_component_id,
            ) as PcbComponent | undefined)
          : undefined

      if (ownerPcbComp) {
        const sourceComp = ownerPcbComp.source_component_id
          ? this.circuitJson.find(
              (e) =>
                e.type === "source_component" &&
                (e as any).source_component_id ===
                  ownerPcbComp.source_component_id,
            )
          : undefined
        ownerRef = (sourceComp as any)?.name ?? (ownerPcbComp as any).name
      }

      // Layer clause
      let layerClause: string | undefined
      if (ra.layers && ra.layers.length > 0) {
        const kicadLayers = ra.layers.map(getKicadLayer)
        layerClause = kicadLayers.join(", ")
      }

      for (const rule of ra.rules ?? []) {
        // Check for unsupported callback or function predicates
        if (
          typeof (rule as any).callback === "function" ||
          typeof (rule as any).predicate === "function"
        ) {
          this.diagnostics.push({
            rule_area_id: raId,
            rule_id: rule.id,
            severity: "error",
            message: `Rule "${rule.id}" uses custom JavaScript callbacks which cannot be translated to KiCad custom rules (.kicad_dru)`,
          })
          continue
        }

        const targetPredicates: string[] = []
        for (const target of rule.targets ?? []) {
          switch (target) {
            case "component":
            case "footprint":
              targetPredicates.push("A.Type == 'Footprint'")
              break
            case "pad":
              targetPredicates.push("A.Type == 'Pad'")
              break
            case "track":
            case "trace":
              targetPredicates.push("A.Type == 'Track'")
              break
            case "via":
              targetPredicates.push("A.Type == 'Via'")
              break
            case "zone":
            case "copper_pour":
              targetPredicates.push("A.Type == 'Zone'")
              break
            default:
              this.diagnostics.push({
                rule_area_id: raId,
                rule_id: rule.id,
                severity: "warning",
                message: `Unknown target type "${target}" in rule "${rule.id}"`,
              })
          }
        }

        const condParts: string[] = []
        condParts.push(`A.intersectsArea('${areaName}')`)

        if (targetPredicates.length === 1) {
          condParts.push(targetPredicates[0]!)
        } else if (targetPredicates.length > 1) {
          condParts.push(`(${targetPredicates.join(" || ")})`)
        }

        // Exemptions
        if (rule.excludeOwner) {
          if (ownerRef) {
            condParts.push(
              `!A.memberOfFootprint('${ownerRef}') && A.Reference != '${ownerRef}'`,
            )
          } else {
            this.diagnostics.push({
              rule_area_id: raId,
              rule_id: rule.id,
              severity: "warning",
              message: `Rule "${rule.id}" specifies excludeOwner but owning component reference could not be resolved`,
            })
          }
        }

        if (rule.excludeComponentClasses?.length) {
          for (const cls of rule.excludeComponentClasses) {
            condParts.push(`!A.hasComponentClass('${cls}')`)
          }
        }

        if (rule.excludeRefs?.length) {
          for (const ref of rule.excludeRefs) {
            condParts.push(
              `!A.memberOfFootprint('${ref}') && A.Reference != '${ref}'`,
            )
          }
        }

        if (rule.exceptNets?.length) {
          for (const net of rule.exceptNets) {
            const bare = net.replace(/^net\./, "")
            if (bare !== net) {
              condParts.push(`A.NetName != '${net}' && A.NetName != '${bare}'`)
            } else {
              condParts.push(`A.NetName != '${net}'`)
            }
          }
        }

        if (rule.exceptNetClasses?.length) {
          for (const nc of rule.exceptNetClasses) {
            condParts.push(`A.NetClass != '${nc}'`)
          }
        }

        const conditionStr = condParts.join(" && ")

        // Constraint
        const clearance = parseDimension(rule.constraint?.clearance, 0)
        let constraintStr: string
        if (clearance > 0) {
          constraintStr = `(constraint clearance (min "${clearance}mm"))`
        } else if (
          rule.constraint?.type === "outside" ||
          rule.constraint?.type === "disallow" ||
          !rule.constraint?.type
        ) {
          constraintStr = "(constraint disallow)"
        } else if (rule.constraint?.type === "inside") {
          constraintStr = "(constraint inside)"
        } else {
          this.diagnostics.push({
            rule_area_id: raId,
            rule_id: rule.id,
            severity: "error",
            message: `Unsupported constraint type "${rule.constraint?.type}" in rule "${rule.id}"`,
          })
          constraintStr = "(constraint disallow)"
        }

        const severity: "error" | "warning" =
          rule.severity === "warning" ? "warning" : "error"

        compiledRules.push({
          name: `${areaName}_${rule.id}`,
          description: rule.description,
          layer: layerClause,
          condition: conditionStr,
          constraint: constraintStr,
          severity,
        })
      }
    }

    if (compiledRules.length === 0) {
      return "(version 1)\n"
    }

    // Order hard rules (error) first so advisory (warning) rules cannot downgrade or override them
    compiledRules.sort((a, b) => {
      if (a.severity === b.severity) return 0
      return a.severity === "error" ? -1 : 1
    })

    const ruleBlocks = compiledRules.map((r) => {
      const lines = [
        `(rule "${r.name}"`,
        r.description ? `  (description "${r.description}")` : null,
        r.layer ? `  (layer "${r.layer}")` : null,
        `  (condition "${r.condition}")`,
        `  ${r.constraint}`,
        `  (severity ${r.severity})`,
        ")",
      ].filter((l): l is string => l !== null)
      return lines.join("\n")
    })

    return `(version 1)\n\n${ruleBlocks.join("\n\n")}\n`
  }
}

export function convertCircuitJsonToKicadDru(
  circuitJson: CircuitJson,
  options?: CircuitJsonToKicadDruOptions,
): string {
  const converter = new CircuitJsonToKicadDruConverter(circuitJson, options)
  return converter.getOutputDru()
}
