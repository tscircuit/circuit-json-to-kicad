import {
  EmbeddedFonts,
  SymbolPinNames,
  SymbolPinNumbers,
  SymbolProperty,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import type {
  KicadSymbolEffects,
  KicadSymbolMetadata,
  KicadSymbolProperty,
} from "@tscircuit/props"
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

const applySymbolProperty = (
  symbol: SymbolEntry["symbol"],
  key: string,
  propertyMeta: KicadSymbolProperty,
): void => {
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
  const { symbol } = kicadSymbol

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
      applySymbolProperty(symbol, key, propertyMeta)
    }
  }

  return kicadSymbol
}
