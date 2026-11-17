import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SchematicText } from "circuit-json"
import { Label, TextEffectsJustify } from "kicadts"
import type { Matrix } from "transformation-matrix"
import {
  transformSchematicConnectionPoint,
  type SchematicConnectionGrid,
} from "./schematicCoordinates"
import { createTextEffects } from "../symbols-stage-converters/createTextEffects"
import { getTextJustificationFromAnchor } from "./getTextJustificationFromAnchor"

/** Convert trace-backed text at its supplied wire attachment to a local label. */
export function createInlineTraceLabel({
  text,
  db,
  transform,
  fontSize,
  connectionGrid,
}: {
  text: SchematicText
  db: CircuitJsonUtilObjects
  transform: Matrix
  fontSize: number
  connectionGrid?: SchematicConnectionGrid
}): Label | undefined {
  if (!text.source_trace_id || !db.source_trace.get(text.source_trace_id)) {
    return undefined
  }

  const { x, y } = transformSchematicConnectionPoint({
    transform: transform,
    point: text.position,
    grid: connectionGrid,
  })
  const effects = createTextEffects(fontSize, false)
  // KiCad local labels sit above horizontal wires (left of vertical wires).
  // Keep its native placement even when core chose the opposite text side.
  effects.justify = new TextEffectsJustify({
    horizontal: getTextJustificationFromAnchor(text.anchor)?.horizontal,
    vertical: "bottom",
  })

  return new Label({
    value: text.text,
    // Circuit JSON text rotations are clockwise-positive; KiCad uses the
    // opposite convention. The attachment point is transformed with the wire.
    at: [x, y, ((-(text.rotation ?? 0) % 360) + 360) % 360],
    effects,
    uuid: crypto.randomUUID(),
  })
}
