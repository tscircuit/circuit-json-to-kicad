import {
  Footprint,
  Property,
  TextEffects,
  TextEffectsFont,
  EmbeddedFonts,
  FootprintModel,
  FootprintAttr,
} from "kicadts"
import type { KicadFootprintMetadata, KicadEffects } from "@tscircuit/props"
import type { kicadComponentProperty } from "./getKicadComponentProperty"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

interface ApplyMetadataToFootprintParams {
  footprint: Footprint
  metadata: KicadFootprintMetadata | undefined
  componentProperty: kicadComponentProperty
}

/**
 * Creates TextEffects from metadata effects, falling back to defaults.
 */
function createTextEffects(metadataEffects?: KicadEffects): TextEffects {
  const font = new TextEffectsFont()
  if (metadataEffects?.font?.size) {
    font.size = {
      width: Number(metadataEffects.font.size.x),
      height: Number(metadataEffects.font.size.y),
    }
  } else {
    font.size = { width: 1.27, height: 1.27 }
  }
  if (metadataEffects?.font?.thickness !== undefined) {
    font.thickness = Number(metadataEffects.font.thickness)
  } else {
    font.thickness = 0.15
  }
  return new TextEffects({ font })
}

/**
 * Applies kicadFootprintMetadata to a Footprint object.
 */
export function applyMetadataToFootprint({
  footprint,
  metadata,
  componentProperty,
}: ApplyMetadataToFootprintParams): void {
  // Apply properties if provided
  let newProperties: Property[] = []
  // Reference property - use explicit metadata value if provided, otherwise fall back to componentLabels.reference
  const refMeta = metadata?.properties?.Reference
  newProperties.push(
    new Property({
      key: "Reference",
      value: refMeta?.value ?? componentProperty.reference,
      position: refMeta?.at
        ? [
            Number(refMeta.at.x),
            Number(refMeta.at.y),
            Number(refMeta.at.rotation ?? 0),
          ]
        : [0, -3, 0],
      layer: refMeta?.layer ?? "F.SilkS",
      uuid: generateDeterministicUuid(
        `${componentProperty.reference}-property-Reference`,
      ),
      effects: createTextEffects(refMeta?.effects),
      hidden: refMeta?.hide ?? true,
    }),
  )
  // Value property - use explicit Value.value first, then footprintName as fallback
  const valMeta = metadata?.properties?.Value
  const valueText =
    valMeta?.value ?? componentProperty.kicadComponentValue ?? ""
  newProperties.push(
    new Property({
      key: "Value",
      value: valueText,
      position: valMeta?.at
        ? [
            Number(valMeta.at.x),
            Number(valMeta.at.y),
            Number(valMeta.at.rotation ?? 0),
          ]
        : [0, 3, 0],
      layer: valMeta?.layer ?? "F.Fab",
      uuid: generateDeterministicUuid(
        `${componentProperty.reference}-property-Value`,
      ),
      effects: createTextEffects(valMeta?.effects),
      hidden: valMeta?.hide ?? true,
    }),
  )
  // Datasheet property

  const dsMeta = metadata?.properties?.Datasheet
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
      uuid: generateDeterministicUuid(
        `${componentProperty.reference}-property-Datasheet`,
      ),
      effects: createTextEffects(dsMeta?.effects),
      hidden: dsMeta?.hide ?? true,
    }),
  )
  // Description property

  const descMeta = metadata?.properties?.Description
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
      uuid: generateDeterministicUuid(
        `${componentProperty.reference}-property-Description`,
      ),
      effects: createTextEffects(descMeta?.effects),
      hidden: descMeta?.hide ?? true,
    }),
  )

  if (componentProperty.supplierPartNumber) {
    newProperties.push(
      new Property({
        key: "Supplier Part Number",
        value: componentProperty.supplierPartNumber,
        position: [0, 0, 0],
        layer: "F.Fab",
        uuid: generateDeterministicUuid(
          `${componentProperty.reference}-property-SupplierPartNumber`,
        ),
        effects: createTextEffects(),
        hidden: true,
      }),
    )
  }

  footprint.properties = newProperties
  // Apply attributes if provided

  if (metadata?.attributes) {
    // Create attr if it doesn't exist

    if (!footprint.attr) {
      footprint.attr = new FootprintAttr()
    }
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
  // Apply footprintName if provided (modifies libraryLink)

  if (metadata?.footprintName) {
    footprint.libraryLink = metadata.footprintName
  }
  // Apply layer if provided

  if (metadata?.layer) {
    footprint.layer = metadata.layer
  }
  // Apply embeddedFonts if provided

  if (metadata?.embeddedFonts !== undefined) {
    footprint.embeddedFonts = new EmbeddedFonts(metadata.embeddedFonts)
  }
  // Apply model if provided

  if (metadata?.model) {
    const model = new FootprintModel(metadata.model.path)
    if (metadata.model.offset) {
      model.offset = {
        x: Number(metadata.model.offset.x),
        y: Number(metadata.model.offset.y),
        z: Number(metadata.model.offset.z),
      }
    }
    if (metadata.model.scale) {
      model.scale = {
        x: Number(metadata.model.scale.x),
        y: Number(metadata.model.scale.y),
        z: Number(metadata.model.scale.z),
      }
    }
    if (metadata.model.rotate) {
      model.rotate = {
        x: Number(metadata.model.rotate.x),
        y: Number(metadata.model.rotate.y),
        z: Number(metadata.model.rotate.z),
      }
    }
    // Add to models array (prepend to give priority over auto-generated models)
    const existingModels = footprint.models || []
    footprint.models = [model, ...existingModels]
  }
}
