import type {
  SchematicComponent,
  SchematicPort,
  SourceComponentBase,
  SourcePort,
} from "circuit-json"

export interface SourceSimpleRotarySwitchLike extends SourceComponentBase {
  ftype: string
  poles?: number
  positions?: number
}

export interface RotarySwitchDimensions {
  poles: number
  positions: number
  hasMountPin: boolean
  kicadSymbolName: string
}

const ROTARY_SYMBOL_NAME_PATTERN =
  /^rotary_switch_(\d+)x(\d+)(?:_(?:right|left|up|down|horz|vert))?$/i

export function isRotarySwitchSourceComponent(
  sourceComponent?: SourceComponentBase | null,
): sourceComponent is SourceSimpleRotarySwitchLike {
  return (
    (sourceComponent as { ftype?: string } | null | undefined)?.ftype ===
    "simple_rotary_switch"
  )
}

export function isRotarySwitchMountSourcePort(
  sourcePort?: SourcePort | null,
): boolean {
  if (!sourcePort || sourcePort.pin_number !== undefined) return false
  if (sourcePort.name?.trim().toUpperCase() === "MP") return true
  return (
    sourcePort.port_hints?.some((hint) => hint.trim().toUpperCase() === "MP") ??
    false
  )
}

export function getRotarySwitchDimensions({
  sourceComponent,
  schematicComponent,
  sourcePorts = [],
}: {
  sourceComponent?: SourceComponentBase | null
  schematicComponent?: SchematicComponent | null
  sourcePorts?: SourcePort[]
}): RotarySwitchDimensions | null {
  const symbolMatch = schematicComponent?.symbol_name
    ? ROTARY_SYMBOL_NAME_PATTERN.exec(schematicComponent.symbol_name.trim())
    : null
  const isRotaryFtype = isRotarySwitchSourceComponent(sourceComponent)

  if (!isRotaryFtype && !symbolMatch) {
    return null
  }

  const componentPorts = sourceComponent
    ? sourcePorts.filter(
        (port) =>
          port.source_component_id === sourceComponent.source_component_id,
      )
    : []
  const hasMountPin = componentPorts.some((port) =>
    isRotarySwitchMountSourcePort(port),
  )

  const rawPoles = isRotaryFtype ? sourceComponent.poles : undefined
  const rawPositions = isRotaryFtype ? sourceComponent.positions : undefined

  const symbolPoles = symbolMatch ? Number.parseInt(symbolMatch[1]!, 10) : NaN
  const symbolPositions = symbolMatch
    ? Number.parseInt(symbolMatch[2]!, 10)
    : NaN

  const poles =
    typeof rawPoles === "number" && Number.isInteger(rawPoles) && rawPoles >= 1
      ? rawPoles
      : Number.isInteger(symbolPoles) && symbolPoles >= 1
        ? symbolPoles
        : 1

  const electricalPortCount = componentPorts.filter(
    (port) => !isRotarySwitchMountSourcePort(port),
  ).length
  const inferredPositions =
    electricalPortCount >= poles * 3
      ? Math.floor(electricalPortCount / poles) - 1
      : 2

  const positions =
    typeof rawPositions === "number" &&
    Number.isInteger(rawPositions) &&
    rawPositions >= 2
      ? rawPositions
      : Number.isInteger(symbolPositions) && symbolPositions >= 2
        ? symbolPositions
        : inferredPositions

  const kicadSymbolName =
    poles === 1 && hasMountPin && positions >= 3 && positions <= 9
      ? `SW_Rotary_1x${positions}_MP`
      : `SW_Rotary_${poles}x${positions}`

  return {
    poles,
    positions,
    hasMountPin,
    kicadSymbolName,
  }
}

export function getRotarySwitchLibraryId(dims: RotarySwitchDimensions): string {
  return `Switch:${dims.kicadSymbolName}`
}

/**
 * Annotates builtin `rotary_switch_*` symbol ports with their explicit KiCad
 * `SW_Rotary_NxM` pinNumber so `createPinSubsymbol` preserves throw/common
 * numbering even when schematicPorts are omitted or ordered differently.
 */
export function annotateRotaryBuiltinSymbolPinNumbers<
  T extends Record<string, any>,
>(
  symbolData: T,
  dims: RotarySwitchDimensions,
): Omit<T, "ports"> & {
  ports: Array<{
    [key: string]: any
    labels?: string[]
    pinNumber?: string | number
  }>
} {
  const maxPin = dims.poles * (dims.positions + 1)
  const rawPorts = Array.isArray(symbolData.ports) ? symbolData.ports : []
  return {
    ...symbolData,
    ports: rawPorts.map((port: any) => {
      if (port.pinNumber !== undefined) return port
      const primaryLabel = port.labels?.[0]?.trim()
      if (!primaryLabel) return port
      if (primaryLabel.toUpperCase() === "MP") {
        return { ...port, pinNumber: "MP" }
      }
      const numeric = Number.parseInt(primaryLabel, 10)
      if (
        String(numeric) === primaryLabel &&
        numeric >= 1 &&
        numeric <= maxPin
      ) {
        return { ...port, pinNumber: primaryLabel }
      }
      return port
    }),
  }
}

/**
 * Synthesizes KiCad-compatible rotary switch symbol data (`SW_Rotary_NxM`) when
 * `schematicComponent.symbol_name` is absent or not yet available in the
 * installed `schematic-symbols` package.
 *
 * Pin numbering follows KiCad's `Switch:SW_Rotary_NxM` convention:
 * - Throws: `1 .. poles * positions` (`(pole - 1) * positions + position`)
 * - Commons: `poles * positions + 1 .. poles * (positions + 1)`
 * - Optional mount pin: `"MP"`
 */
export function createRotarySwitchSymbolData({
  dims,
  schematicComponent,
  schematicPorts,
  sourcePorts,
}: {
  dims: RotarySwitchDimensions
  schematicComponent: SchematicComponent
  schematicPorts: SchematicPort[]
  sourcePorts: SourcePort[]
}) {
  const { poles, positions, hasMountPin } = dims
  const totalThrows = poles * positions
  const cx = schematicComponent.center.x
  const cy = schematicComponent.center.y

  const sourcePortsById = new Map(
    sourcePorts.map((port) => [port.source_port_id, port]),
  )
  const componentSchematicPorts = schematicPorts.filter(
    (port) =>
      port.schematic_component_id === schematicComponent.schematic_component_id,
  )

  const schPortByPinKey = new Map<string, SchematicPort>()
  for (const schPort of componentSchematicPorts) {
    const linkedSource = schPort.source_port_id
      ? sourcePortsById.get(schPort.source_port_id)
      : undefined
    if (isRotarySwitchMountSourcePort(linkedSource)) {
      schPortByPinKey.set("MP", schPort)
      continue
    }
    const pinNum = schPort.pin_number ?? linkedSource?.pin_number
    if (pinNum !== undefined && pinNum !== null) {
      schPortByPinKey.set(String(pinNum), schPort)
    }
  }

  const withinPoleStep = 0.2
  const interPoleGap = 0.3
  const poleSpan = (positions - 1) * withinPoleStep
  const baseTotalSpan = poles * poleSpan + Math.max(0, poles - 1) * interPoleGap
  const defaultHalfHeight = Math.max(
    0.3,
    baseTotalSpan / 2 + (hasMountPin ? withinPoleStep : 0),
  )
  // Keep |dx| > |dy| so horizontal pins classify cleanly as left/right in calculatePinPosition
  const defaultPortHalfWidth = Math.max(
    schematicComponent.size?.width ? schematicComponent.size.width / 2 : 0.5,
    defaultHalfHeight + 0.12,
  )

  const topY = cy + baseTotalSpan / 2
  const ports: Array<{
    x: number
    y: number
    labels: string[]
    pinNumber: string | number
  }> = []

  const poleCoordinates: Array<{
    pole: number
    commonPort: { x: number; y: number }
    throwPorts: Array<{ x: number; y: number }>
  }> = []

  for (let p = 0; p < poles; p++) {
    const poleNum = p + 1
    const commonPin = totalThrows + poleNum
    const poleTopY = topY - p * (poleSpan + interPoleGap)

    const throwPositions: Array<{ x: number; y: number }> = []
    for (let k = 0; k < positions; k++) {
      const throwPin = p * positions + (k + 1)
      const existingThrowPort = schPortByPinKey.get(String(throwPin))
      const tx = existingThrowPort
        ? existingThrowPort.center.x
        : cx + defaultPortHalfWidth
      const ty = existingThrowPort
        ? existingThrowPort.center.y
        : poleTopY - k * withinPoleStep
      const pt = { x: tx, y: ty }
      throwPositions.push(pt)
      ports.push({
        x: pt.x,
        y: pt.y,
        labels: [String(throwPin)],
        pinNumber: throwPin,
      })
    }

    const defaultCommonY =
      (throwPositions[0]!.y + throwPositions[throwPositions.length - 1]!.y) / 2
    const existingCommonPort = schPortByPinKey.get(String(commonPin))
    const commonPt = existingCommonPort
      ? { x: existingCommonPort.center.x, y: existingCommonPort.center.y }
      : { x: cx - defaultPortHalfWidth, y: defaultCommonY }

    ports.push({
      x: commonPt.x,
      y: commonPt.y,
      labels: [String(commonPin)],
      pinNumber: commonPin,
    })

    poleCoordinates.push({
      pole: poleNum,
      commonPort: commonPt,
      throwPorts: throwPositions,
    })
  }

  if (hasMountPin) {
    const existingMp = schPortByPinKey.get("MP")
    const bottomCommonY =
      poleCoordinates[poleCoordinates.length - 1]!.commonPort.y
    const mpPt = existingMp
      ? { x: existingMp.center.x, y: existingMp.center.y }
      : {
          x: cx - defaultPortHalfWidth,
          y: bottomCommonY - withinPoleStep * 1.5,
        }
    ports.push({
      x: mpPt.x,
      y: mpPt.y,
      labels: ["MP"],
      pinNumber: "MP",
    })
  }

  // Build KiCad schematic primitives (leads, contact circles, wipers, gang dashes)
  const primitives: any[] = []
  const circleRadius = 0.03
  const wiperMidYs: number[] = []
  let gangX = cx

  for (const poleCoord of poleCoordinates) {
    const leftPortX = poleCoord.commonPort.x
    const rightPortX = poleCoord.throwPorts[0]!.x
    const spanX = rightPortX - leftPortX
    const commonCircleX = leftPortX + spanX * 0.32
    const throwCircleX = leftPortX + spanX * 0.68
    gangX = (commonCircleX + throwCircleX) / 2
    const dirSign = spanX >= 0 ? 1 : -1

    // Common lead + circle
    primitives.push({
      type: "path",
      points: [
        { x: leftPortX, y: poleCoord.commonPort.y },
        {
          x: commonCircleX - dirSign * circleRadius,
          y: poleCoord.commonPort.y,
        },
      ],
    })
    primitives.push({
      type: "circle",
      x: commonCircleX,
      y: poleCoord.commonPort.y,
      radius: circleRadius,
      fill: false,
    })

    // Throw leads + circles
    for (const throwPt of poleCoord.throwPorts) {
      primitives.push({
        type: "path",
        points: [
          { x: throwCircleX + dirSign * circleRadius, y: throwPt.y },
          { x: throwPt.x, y: throwPt.y },
        ],
      })
      primitives.push({
        type: "circle",
        x: throwCircleX,
        y: throwPt.y,
        radius: circleRadius,
        fill: false,
      })
    }

    // Wiper arm toward position 1 of this pole
    const targetThrow = poleCoord.throwPorts[0]!
    const wdx = throwCircleX - commonCircleX
    const wdy = targetThrow.y - poleCoord.commonPort.y
    const wdist = Math.hypot(wdx, wdy) || 1
    const ux = wdx / wdist
    const uy = wdy / wdist
    const wStart = {
      x: commonCircleX + ux * circleRadius,
      y: poleCoord.commonPort.y + uy * circleRadius,
    }
    const wEnd = {
      x: throwCircleX - ux * (circleRadius * 1.6),
      y: targetThrow.y - uy * (circleRadius * 1.6),
    }
    primitives.push({
      type: "path",
      points: [wStart, wEnd],
    })

    const tMid =
      Math.abs(wEnd.x - wStart.x) > 1e-9
        ? (gangX - wStart.x) / (wEnd.x - wStart.x)
        : 0.5
    wiperMidYs.push(wStart.y + tMid * (wEnd.y - wStart.y))
  }

  if (poles > 1 && wiperMidYs.length >= 2) {
    primitives.push({
      type: "path",
      isDashed: true,
      points: [
        { x: gangX, y: wiperMidYs[0]! },
        { x: gangX, y: wiperMidYs[wiperMidYs.length - 1]! },
      ],
    })
  }

  if (hasMountPin) {
    const mpPort = ports.find((p) => p.pinNumber === "MP")!
    const spanLen = defaultPortHalfWidth * 0.3
    primitives.push({
      type: "path",
      points: [
        { x: mpPort.x, y: mpPort.y },
        { x: mpPort.x + spanLen, y: mpPort.y },
      ],
    })
  }

  const allXs = ports.map((p) => p.x)
  const allYs = ports.map((p) => p.y)
  const width = allXs.length > 0 ? Math.max(...allXs) - Math.min(...allXs) : 1.2
  const height =
    allYs.length > 0 ? Math.max(...allYs) - Math.min(...allYs) : 1.0

  return {
    center: { x: cx, y: cy },
    primitives,
    ports,
    texts: [],
    size: {
      width: Math.max(width, 0.4),
      height: Math.max(height, 0.4),
    },
  }
}
