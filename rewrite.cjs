const fs = require('fs')
let content = fs.readFileSync('lib/pcb/stages/AddGraphicsStage.ts', 'utf8')

content = content.replace(
  /import polygonClipping, \{ type Geom \} from "polygon-clipping"/g,
  `import Flatten from "@flatten-js/core"\nconst { Polygon, Point, Circle, BooleanOperations } = Flatten`
)

content = content.replace(
  /import \{ GrCircle, GrLine, GrPoly \} from "kicadts"/g,
  `import { GrArc, GrCircle, GrLine, GrPoly } from "kicadts"`
)

content = content.replace(
  /const appendGraphicLine = \(kicadPcb: KicadPcb, grLine: GrLine\) => \{/g,
  `const appendGraphicArc = (kicadPcb: KicadPcb, grArc: GrArc) => {\n  const graphicArcs = kicadPcb.graphicArcs || []\n  graphicArcs.push(grArc)\n  kicadPcb.graphicArcs = graphicArcs\n}\n\nconst appendGraphicLine = (kicadPcb: KicadPcb, grLine: GrLine) => {`
)

const oldLogic = `      const cutoutPolys: Geom[] = []
      for (const cutout of pcbCutouts) {
        if (cutout.shape === "rect") {
          const cutoutCorners = getRectCutoutCorners(cutout)
          cutoutPolys.push([[cutoutCorners.map((c) => [c.x, c.y])]])
        } else if (cutout.shape === "circle") {
          const pts: [number, number][] = []
          const steps = 64
          for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2
            pts.push([
              cutout.center.x + cutout.radius * Math.cos(angle),
              cutout.center.y + cutout.radius * Math.sin(angle),
            ])
          }
          cutoutPolys.push([[pts]])
        } else if (cutout.shape === "polygon") {
          cutoutPolys.push([[cutout.points.map((c) => [c.x, c.y])]])
        }
      }

      let boardGeom: Geom = [[boardPolyCoords]]
      if (cutoutPolys.length > 0) {
        boardGeom = polygonClipping.difference(boardGeom, ...cutoutPolys)
      }

      // Convert resulting polygons back to lines on Edge.Cuts
      for (const poly of boardGeom) {
        for (const ring of poly) {
          const transformedRing = ring.map((point: [number, number]) =>
            applyToPoint(c2kMatPcb, { x: point[0], y: point[1] }),
          )

          for (let i = 0; i < transformedRing.length; i++) {
            const start = transformedRing[i]
            const end = transformedRing[(i + 1) % transformedRing.length]

            if (!start || !end) continue
            if (pointsAreEqual(start, end)) continue

            const edgeLine = new GrLine({
              start: { x: start.x, y: start.y },
              end: { x: end.x, y: end.y },
              layer: "Edge.Cuts",
              width: EDGE_CUTS_WIDTH,
            })

            appendGraphicLine(kicadPcb, edgeLine)
          }
        }
      }`

const newLogic = `      let boardGeom = new Polygon([
        boardPolyCoords.map((c) => new Point(c[0], c[1]))
      ])

      for (const cutout of pcbCutouts) {
        if (cutout.shape === "rect") {
          const cutoutCorners = getRectCutoutCorners(cutout)
          const rectPoly = new Polygon([cutoutCorners.map((c) => new Point(c.x, c.y))])
          boardGeom = BooleanOperations.subtract(boardGeom, rectPoly)
        } else if (cutout.shape === "circle") {
          const circle = new Circle(new Point(cutout.center.x, cutout.center.y), cutout.radius)
          const circlePoly = new Polygon(circle)
          boardGeom = BooleanOperations.subtract(boardGeom, circlePoly)
        } else if (cutout.shape === "polygon") {
          const poly = new Polygon([cutout.points.map((c) => new Point(c.x, c.y))])
          boardGeom = BooleanOperations.subtract(boardGeom, poly)
        }
      }

      // Convert resulting edges back to lines/arcs on Edge.Cuts
      for (const edge of boardGeom.edges) {
        if (edge.shape instanceof Flatten.Segment) {
          const start = applyToPoint(c2kMatPcb, { x: edge.shape.start.x, y: edge.shape.start.y })
          const end = applyToPoint(c2kMatPcb, { x: edge.shape.end.x, y: edge.shape.end.y })
          if (!pointsAreEqual(start, end)) {
            appendGraphicLine(
              kicadPcb,
              new GrLine({
                start,
                end,
                layer: "Edge.Cuts",
                width: EDGE_CUTS_WIDTH,
              })
            )
          }
        } else if (edge.shape instanceof Flatten.Arc) {
          const center = applyToPoint(c2kMatPcb, { x: edge.shape.pc.x, y: edge.shape.pc.y })
          
          // Flatten.Arc uses sweep. Kicad requires start, mid, and end.
          // We compute these on the original circle and transform them.
          const startAngle = edge.shape.startAngle
          const endAngle = edge.shape.endAngle
          const sweep = edge.shape.sweep
          
          const midAngle = startAngle + sweep / 2
          
          const r = edge.shape.r
          const rawStart = { x: edge.shape.pc.x + r * Math.cos(startAngle), y: edge.shape.pc.y + r * Math.sin(startAngle) }
          const rawMid = { x: edge.shape.pc.x + r * Math.cos(midAngle), y: edge.shape.pc.y + r * Math.sin(midAngle) }
          const rawEnd = { x: edge.shape.pc.x + r * Math.cos(endAngle), y: edge.shape.pc.y + r * Math.sin(endAngle) }
          
          const start = applyToPoint(c2kMatPcb, rawStart)
          const mid = applyToPoint(c2kMatPcb, rawMid)
          const end = applyToPoint(c2kMatPcb, rawEnd)

          appendGraphicArc(
            kicadPcb,
            new GrArc({
              start,
              mid,
              end,
              layer: "Edge.Cuts",
              width: EDGE_CUTS_WIDTH,
            })
          )
        }
      }`

content = content.replace(oldLogic, newLogic)
fs.writeFileSync('lib/pcb/stages/AddGraphicsStage.ts', content)
console.log("Rewrite successful.")
