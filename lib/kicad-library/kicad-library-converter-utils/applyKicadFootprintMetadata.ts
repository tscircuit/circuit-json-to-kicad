import {
  parseKicadSexpr,
  Footprint,
  Property,
  TextEffects,
  TextEffectsFont,
} from "kicadts"
import type { KicadFootprintMetadata } from "@tscircuit/props"
import { generateDeterministicUuid } from "../../pcb/stages/utils/generateDeterministicUuid"

/**
 * Applies kicadFootprintMetadata props to a footprint string.
 * This allows component props to override default footprint properties.
 */
export function applyKicadFootprintMetadata(
  kicadModString: string,
  metadata: KicadFootprintMetadata,
  footprintName: string,
): string {
  try {
    const parsed = parseKicadSexpr(kicadModString)
    const footprint = parsed.find(
      (node): node is Footprint => node instanceof Footprint,
    )

    if (!footprint) {
      return kicadModString
    }

    // Apply version/generator metadata if provided
    if (metadata.version !== undefined) {
      footprint.version = Number(metadata.version)
    }
    if (metadata.generator !== undefined) {
      footprint.generator = metadata.generator
    }
    if (metadata.generatorVersion !== undefined) {
      footprint.generatorVersion = String(metadata.generatorVersion)
    }

    // Apply embedded fonts setting
    if (metadata.embeddedFonts !== undefined) {
      // The footprint already has embeddedFonts set, we just update the value
    }

    // Apply properties if provided
    if (metadata.properties) {
      const defaultFont = new TextEffectsFont()
      defaultFont.size = { width: 1.27, height: 1.27 }
      defaultFont.thickness = 0.15
      const defaultEffects = new TextEffects({ font: defaultFont })

      const newProperties: Property[] = []

      // Reference property
      const refMeta = metadata.properties.Reference
      newProperties.push(
        new Property({
          key: "Reference",
          value: refMeta?.value ?? "REF**",
          position: refMeta?.at
            ? [
                Number(refMeta.at.x),
                Number(refMeta.at.y),
                Number(refMeta.at.rotation ?? 0),
              ]
            : [0, 0, 0],
          layer: refMeta?.layer ?? "F.SilkS",
          uuid:
            refMeta?.uuid ??
            generateDeterministicUuid(`${footprintName}-property-Reference`),
          effects: defaultEffects,
          hidden: refMeta?.hide,
        }),
      )

      // Value property
      const valMeta = metadata.properties.Value
      newProperties.push(
        new Property({
          key: "Value",
          value: valMeta?.value ?? footprintName,
          position: valMeta?.at
            ? [
                Number(valMeta.at.x),
                Number(valMeta.at.y),
                Number(valMeta.at.rotation ?? 0),
              ]
            : [0, 0, 0],
          layer: valMeta?.layer ?? "F.Fab",
          uuid:
            valMeta?.uuid ??
            generateDeterministicUuid(`${footprintName}-property-Value`),
          effects: defaultEffects,
          hidden: valMeta?.hide,
        }),
      )

      // Datasheet property
      const dsMeta = metadata.properties.Datasheet
      newProperties.push(
        new Property({
          key: "Datasheet",
          value: dsMeta?.value ?? "",
          position: dsMeta?.at
            ? [
                Number(dsMeta.at.x),
                Number(dsMeta.at.y),
                Number(dsMeta.at.rotation ?? 0),
              ]
            : [0, 0, 0],
          layer: dsMeta?.layer ?? "F.Fab",
          uuid:
            dsMeta?.uuid ??
            generateDeterministicUuid(`${footprintName}-property-Datasheet`),
          effects: defaultEffects,
          hidden: dsMeta?.hide ?? true,
        }),
      )

      // Description property
      const descMeta = metadata.properties.Description
      newProperties.push(
        new Property({
          key: "Description",
          value: descMeta?.value ?? "",
          position: descMeta?.at
            ? [
                Number(descMeta.at.x),
                Number(descMeta.at.y),
                Number(descMeta.at.rotation ?? 0),
              ]
            : [0, 0, 0],
          layer: descMeta?.layer ?? "F.Fab",
          uuid:
            descMeta?.uuid ??
            generateDeterministicUuid(`${footprintName}-property-Description`),
          effects: defaultEffects,
          hidden: descMeta?.hide ?? true,
        }),
      )

      footprint.properties = newProperties
    }

    // Apply attributes if provided
    if (metadata.attributes && footprint.attr) {
      if (metadata.attributes.through_hole) {
        footprint.attr.type = "through_hole"
      } else if (metadata.attributes.smd) {
        footprint.attr.type = "smd"
      }
      if (metadata.attributes.exclude_from_pos_files !== undefined) {
        footprint.attr.excludeFromPosFiles =
          metadata.attributes.exclude_from_pos_files
      }
      if (metadata.attributes.exclude_from_bom !== undefined) {
        footprint.attr.excludeFromBom = metadata.attributes.exclude_from_bom
      }
    }

    return footprint.getString()
  } catch (error) {
    console.warn(`Failed to apply kicadFootprintMetadata:`, error)
    return kicadModString
  }
}
