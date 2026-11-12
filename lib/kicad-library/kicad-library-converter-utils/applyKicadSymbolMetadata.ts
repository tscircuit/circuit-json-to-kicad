import type {
  KicadSymbolEffects,
  KicadSymbolMetadata,
  KicadSymbolProperty,
} from "@tscircuit/props"
import {
  EmbeddedFonts,
  type SchematicSymbol,
  SymbolPinNames,
  SymbolPinNumbers,
  SymbolProperty,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import type { SymbolEntry } from "../../types"

const DEFAULT_TEXT_SIZE = 1.27
const DEFAULT_TEXT_THICKNESS = 0.15

const toNumber = (
  value: number | string | undefined,
  fallback?: number,
): number | undefined => {
  if (value === undefined) return fallback
  const parsed = typeof value === "number" ? value : Number.parseFloat(value)
  if (Number.isNaN(parsed)) return fallback
  return parsed
}

const createTextEffects = (
  effectsMeta: KicadSymbolEffects | undefined,
  fallback?: TextEffects,
): TextEffects | undefined => {
  if (!effectsMeta) return fallback

  const effects = new TextEffects({
    font: fallback?.font,
    justify: fallback?.justify,
    hiddenText: fallback?.hiddenText ?? false,
  })

  if (!effects.font) {
    const defaultFont = new TextEffectsFont()
    defaultFont.size = { width: DEFAULT_TEXT_SIZE, height: DEFAULT_TEXT_SIZE }
    effects.font = defaultFont
  }

  if (effectsMeta.font?.size) {
    effects.font.size = {
      width: toNumber(effectsMeta.font.size.x, DEFAULT_TEXT_SIZE)!,
      height: toNumber(effectsMeta.font.size.y, DEFAULT_TEXT_SIZE)!,
    }
  }
  if (effectsMeta.font?.thickness !== undefined) {
    effects.font.thickness = toNumber(
      effectsMeta.font.thickness,
      DEFAULT_TEXT_THICKNESS,
    )!
  }

  if (!effects.font.size) {
    effects.font.size = { width: DEFAULT_TEXT_SIZE, height: DEFAULT_TEXT_SIZE }
  }
  if (!effects.font.thickness && effectsMeta.font?.thickness !== undefined) {
    effects.font.thickness = DEFAULT_TEXT_THICKNESS
  }

  const justify = createJustify(effectsMeta.justify)
  if (justify) {
    effects.justify = justify
  }
  if (effectsMeta.hide !== undefined) {
    effects.hiddenText = effectsMeta.hide
  }

  return effects
}

const createJustify = (
  justifyInput: string | string[] | undefined,
): TextEffectsJustify | undefined => {
  if (!justifyInput) return undefined
  const values = Array.isArray(justifyInput) ? justifyInput : [justifyInput]
  const options: {
    horizontal?: "left" | "right"
    vertical?: "top" | "bottom"
    mirror?: boolean
  } = {}

  for (const value of values) {
    if (value === "left" || value === "right") {
      options.horizontal = value
    } else if (value === "top" || value === "bottom") {
      options.vertical = value
    } else if (value === "mirror") {
      options.mirror = true
    }
  }

  if (!options.horizontal && !options.vertical && !options.mirror) {
    return undefined
  }

  return new TextEffectsJustify(options)
}

export const applySymbolProperty = ({
  symbol,
  key,
  propertyMeta,
}: {
  symbol: SymbolEntry["symbol"]
  key: string
  propertyMeta: KicadSymbolProperty
}): void => {
  const existingProperty = symbol.properties.find((prop) => prop.key === key)
  const nextId =
    propertyMeta.id !== undefined
      ? toNumber(propertyMeta.id)
      : existingProperty?.id
  const nextAt = propertyMeta.at
    ? ([
        toNumber(propertyMeta.at.x, 0)!,
        toNumber(propertyMeta.at.y, 0)!,
        toNumber(propertyMeta.at.rotation, 0)!,
      ] as [number, number, number])
    : existingProperty?.at

  const nextEffects = createTextEffects(
    propertyMeta.effects,
    existingProperty?.effects,
  )

  if (existingProperty) {
    existingProperty.value = propertyMeta.value
    if (nextId !== undefined) {
      existingProperty.id = nextId
    }
    if (nextAt) {
      existingProperty.at = nextAt
    }
    if (nextEffects) {
      existingProperty.effects = nextEffects
    }
    return
  }

  symbol.properties.push(
    new SymbolProperty({
      key,
      value: propertyMeta.value,
      id: nextId,
      at: nextAt,
      effects: nextEffects,
    }),
  )
}

/**
 * Applies kicadSymbolMetadata props to a symbol entry.
 */
export function applyKicadSymbolMetadata(
  kicadSymbol: SymbolEntry,
  metadata: KicadSymbolMetadata,
): SymbolEntry {
  applyKicadSymbolMetadataToSymbol(kicadSymbol.symbol, metadata)
  return kicadSymbol
}

export function applyKicadSymbolMetadataToSymbol(
  symbol: SchematicSymbol,
  metadata: KicadSymbolMetadata,
): void {
  if (metadata.excludeFromSim !== undefined) {
    symbol.excludeFromSim = metadata.excludeFromSim
  }
  if (metadata.inBom !== undefined) {
    symbol.inBom = metadata.inBom
  }
  if (metadata.onBoard !== undefined) {
    symbol.onBoard = metadata.onBoard
  }
  if (metadata.embeddedFonts !== undefined) {
    symbol._sxEmbeddedFonts = new EmbeddedFonts(metadata.embeddedFonts)
  }

  if (metadata.pinNumbers?.hide !== undefined) {
    const pinNumbers = symbol.pinNumbers ?? new SymbolPinNumbers()
    pinNumbers.hide = metadata.pinNumbers.hide
    symbol.pinNumbers = pinNumbers
  }

  if (metadata.pinNames) {
    const pinNames = symbol.pinNames ?? new SymbolPinNames()
    if (metadata.pinNames.offset !== undefined) {
      pinNames.offset = toNumber(metadata.pinNames.offset, pinNames.offset)
    }
    if (metadata.pinNames.hide !== undefined) {
      pinNames.hide = metadata.pinNames.hide
    }
    symbol.pinNames = pinNames
  }

  if (metadata.properties) {
    for (const [key, propertyMeta] of Object.entries(metadata.properties)) {
      if (!propertyMeta) continue
      applySymbolProperty({ symbol, key, propertyMeta })
    }
  }

  const extMeta = metadata as any
  if (
    extMeta.pinLength !== undefined ||
    extMeta.defaultPinLength !== undefined
  ) {
    const defaultLength = Number(extMeta.pinLength ?? extMeta.defaultPinLength)
    for (const unit of symbol.subSymbols ?? []) {
      for (const pin of unit.pins ?? []) {
        pin.length = defaultLength
      }
    }
  }

  if (extMeta.pins) {
    for (const [pinKey, pinMeta] of Object.entries(extMeta.pins) as [
      string,
      any,
    ][]) {
      if (!pinMeta) continue
      for (const unit of symbol.subSymbols ?? []) {
        for (const pin of unit.pins ?? []) {
          const pinNumber =
            (pin as any)._sxNumber?.value ?? (pin as any).pinNumber?.value
          const pinName =
            (pin as any)._sxName?.value ?? (pin as any).pinName?.value
          if (pinNumber === pinKey || pinName === pinKey) {
            if (pinMeta.pinLength !== undefined) {
              pin.length = Number(pinMeta.pinLength)
            }
            if (pinMeta.electricalType !== undefined) {
              pin.pinElectricalType = pinMeta.electricalType
            }
            if (pinMeta.graphicStyle !== undefined) {
              pin.pinGraphicStyle = pinMeta.graphicStyle
            }
          }
        }
      }
    }
  }

  if (extMeta.snapToGrid) {
    const gridSize =
      typeof extMeta.snapToGrid === "number" && extMeta.snapToGrid > 0
        ? extMeta.snapToGrid
        : 1.27
    for (const unit of symbol.subSymbols ?? []) {
      for (const pin of unit.pins ?? []) {
        if (Array.isArray(pin.at)) {
          pin.at[0] = Math.round(pin.at[0] / gridSize) * gridSize
          pin.at[1] = Math.round(pin.at[1] / gridSize) * gridSize
        } else if (pin.at && typeof pin.at === "object") {
          if ("x" in pin.at) {
            pin.at.x = Math.round(pin.at.x / gridSize) * gridSize
          }
          if ("y" in pin.at) {
            pin.at.y = Math.round(pin.at.y / gridSize) * gridSize
          }
        }
      }
    }
  }
}
