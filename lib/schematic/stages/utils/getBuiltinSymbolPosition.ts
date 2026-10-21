import type { SchematicComponent, SchematicPort } from "circuit-json"
import { getSchematicSymbolData } from "../../getSchematicSymbolData"

export function getBuiltinSymbolPosition(
  component: SchematicComponent,
  schematicPorts: SchematicPort[],
): { x: number; y: number } {
  const symbol = component.symbol_name
    ? getSchematicSymbolData(component.symbol_name)
    : undefined
  const ports = schematicPorts.filter(
    (port) => port.schematic_component_id === component.schematic_component_id,
  )
  if (!symbol?.ports.length || !ports.length) return component.center

  const symbolPorts = symbol.ports.map((port) => ({
    x: port.x - (symbol.center?.x ?? 0),
    y: port.y - (symbol.center?.y ?? 0),
  }))
  const position = {
    x:
      Math.min(...ports.map((p) => p.center.x)) -
      Math.min(...symbolPorts.map((p) => p.x)),
    y:
      Math.min(...ports.map((p) => p.center.y)) -
      Math.min(...symbolPorts.map((p) => p.y)),
  }

  // Library origins can change between versions. Translate the whole symbol
  // only when every pin position still matches the saved Circuit JSON layout.
  const matches = (symbolPort: { x: number; y: number }, port: SchematicPort) =>
    Math.abs(symbolPort.x + position.x - port.center.x) < 1e-6 &&
    Math.abs(symbolPort.y + position.y - port.center.y) < 1e-6
  if (
    symbolPorts.every((p) => ports.some((port) => matches(p, port))) &&
    ports.every((port) => symbolPorts.some((p) => matches(p, port)))
  ) {
    return position
  }
  return component.center
}
