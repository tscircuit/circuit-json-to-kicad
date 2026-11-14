import type { KicadFootprintMetadata } from "@tscircuit/props"
import { Property, TextEffects, TextEffectsFont } from "kicadts"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

const BUILT_IN_FOOTPRINT_PROPERTY_NAMES = new Set([
  "Reference",
  "Value",
  "Datasheet",
  "Description",
])

export function applyCustomFootprintProperties({
  properties,
  metadata,
  footprintName,
}: {
  properties: Property[]
  metadata: KicadFootprintMetadata | undefined
  footprintName: string
}): void {
  for (const [key, propertyMeta] of Object.entries(
    metadata?.properties ?? {},
  )) {
    if (!propertyMeta || BUILT_IN_FOOTPRINT_PROPERTY_NAMES.has(key)) continue

    const font = new TextEffectsFont()
    font.size = {
      width: Number(propertyMeta.effects?.font?.size?.x ?? 1.27),
      height: Number(propertyMeta.effects?.font?.size?.y ?? 1.27),
    }
    font.thickness = Number(propertyMeta.effects?.font?.thickness ?? 0.15)

    const property = new Property({
      key,
      value: propertyMeta.value,
      position: [
        Number(propertyMeta.at?.x ?? 0),
        Number(propertyMeta.at?.y ?? 0),
        Number(propertyMeta.at?.rotation ?? 0),
      ],
      layer: propertyMeta.layer ?? "F.Fab",
      hidden: propertyMeta.hide ?? true,
      uuid:
        propertyMeta.uuid ??
        generateDeterministicUuid(`${footprintName}-property-${key}`),
      effects: new TextEffects({ font }),
    })
    const existingIndex = properties.findIndex(
      (existing) => existing.key === key,
    )
    if (existingIndex === -1) {
      properties.push(property)
    } else {
      properties[existingIndex] = property
    }
  }
}
