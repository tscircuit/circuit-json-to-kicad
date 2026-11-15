import { parseKicadSch, SymbolLibId, Xy, type KicadSch } from "kicadts"
import {
  applyToPoint,
  compose,
  inverse,
  rotateDEG,
  scale,
  translate,
} from "transformation-matrix"

/**
 * Align electrical anchors in KiCad page space (+X right, +Y down, mm).
 * Library pins are local points (+Y up); compose the instance transform before
 * snapping and invert the snapped instance transform to recover local points.
 * This opt-in operation leaves artwork shapes and the input Circuit JSON intact.
 */
export function snapSchematicToGrid(
  schematic: KicadSch,
  gridSize: number,
): void {
  const round = (coordinate: number) => Number(coordinate.toFixed(6))
  const snap = (coordinate: number) =>
    round(Math.round(coordinate / gridSize) * gridSize)
  const snapPoint = (point: { x: number; y: number }) => {
    point.x = snap(point.x)
    point.y = snap(point.y)
  }

  const pinsByGridPoint = new Map<string, { x: number; y: number }>()
  const snapPinPoint = (point: { x: number; y: number }) => {
    const gridPoint = `${snap(point.x)},${snap(point.y)}`
    const previous = pinsByGridPoint.get(gridPoint)
    if (
      previous &&
      Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-6
    ) {
      throw new Error("Schematic grid merges distinct pins; use a smaller grid")
    }
    pinsByGridPoint.set(gridPoint, { x: point.x, y: point.y })
    snapPoint(point)
  }

  const librarySymbols = schematic.libSymbols?.symbols ?? []
  const libraryIds = new Set(librarySymbols.map((symbol) => symbol.libraryId))
  const alignedLibrarySymbols = [...librarySymbols]
  let variantNumber = 1

  for (const instance of schematic.symbols) {
    if (!instance.at) continue
    const librarySymbol = librarySymbols.find(
      (symbol) => symbol.libraryId === instance.libraryId,
    )
    if (!librarySymbol) {
      throw new Error(
        "Cannot align a schematic symbol without its library definition",
      )
    }

    // Clone the native model through its parser so its classes and all artwork
    // survive. Each instance may need different local pin offsets after snapping.
    const alignedSymbol = parseKicadSch(
      `(kicad_sch (lib_symbols ${librarySymbol.getString()}))`,
    ).libSymbols!.symbols[0]!
    let alignedLibraryId: string
    do {
      alignedLibraryId = `${instance.libraryId}_grid_${variantNumber++}`
    } while (libraryIds.has(alignedLibraryId))
    libraryIds.add(alignedLibraryId)
    alignedSymbol.libraryId = alignedLibraryId
    const oldLocalName = instance.libraryId!.split(":").at(-1)!
    const newLocalName = alignedLibraryId.split(":").at(-1)!
    for (const unit of alignedSymbol.subSymbols) {
      if (unit.libraryId?.startsWith(`${oldLocalName}_`)) {
        unit.libraryId =
          newLocalName + unit.libraryId.slice(oldLocalName.length)
      }
    }

    const localToPage = (x: number, y: number) =>
      compose(
        translate(x, y),
        rotateDEG(-(instance.at!.angle ?? 0)),
        scale(
          instance.mirror === "y" ? -1 : 1,
          instance.mirror === "x" ? 1 : -1,
        ),
      )
    const oldX = instance.at.x
    const oldY = instance.at.y
    const oldTransform = localToPage(oldX, oldY)
    snapPoint(instance.at)
    for (const property of instance.properties) {
      if (property.at) {
        property.at.x = round(property.at.x + instance.at.x - oldX)
        property.at.y = round(property.at.y + instance.at.y - oldY)
      }
    }
    const pageToLocal = inverse(localToPage(instance.at.x, instance.at.y))

    for (const unit of alignedSymbol.subSymbols) {
      for (const pin of unit.pins) {
        if (!pin.at) continue
        const pagePoint = applyToPoint(oldTransform, pin.at)
        snapPinPoint(pagePoint)
        const localPoint = applyToPoint(pageToLocal, pagePoint)
        pin.at.x = round(localPoint.x)
        pin.at.y = round(localPoint.y)
      }
    }
    instance.libraryId = new SymbolLibId(alignedLibraryId)
    alignedLibrarySymbols.push(alignedSymbol)
  }
  if (schematic.libSymbols) schematic.libSymbols.symbols = alignedLibrarySymbols

  for (const wire of schematic.wires) {
    for (const point of wire.points?.points ?? []) {
      if (point instanceof Xy) snapPoint(point)
    }
  }
  for (const anchor of [
    ...schematic.junctions,
    ...schematic.labels,
    ...schematic.globalLabels,
    ...schematic.noConnects,
  ]) {
    if (anchor.at) snapPoint(anchor.at)
  }
  for (const sheet of schematic.sheets) {
    for (const pin of sheet.pins) {
      if (pin.position) snapPoint(pin.position)
    }
  }
}
