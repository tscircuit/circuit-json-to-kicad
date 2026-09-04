import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

type Vector = [number, number, number]

// Apply an axis-angle rotation independently of the exporter's Euler conversion.
function turn(v: Vector, axis: Vector, degrees: number): Vector {
  const angle = (degrees * Math.PI) / 180
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dot = v.reduce((sum, value, i) => sum + value * axis[i]!, 0)
  const cross = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ]
  return v.map(
    (value, i) => value * c + cross[i]! * s + axis[i]! * dot * (1 - c),
  ) as Vector
}
const X: Vector = [1, 0, 0]
const Y: Vector = [0, 1, 0]
const Z: Vector = [0, 0, 1]

test("exported models preserve world placement on both footprint sides", async () => {
  for (const layer of ["top", "bottom"] as const) {
    for (const pcbRotation of [0, 90, 180, 270, 37]) {
      for (const rotationOffset of [
        { x: 0, y: 0, z: 0 },
        { x: 23, y: -31, z: 17 },
        { x: 0, y: 90, z: 0 },
        { x: 0, y: -90, z: 0 },
        { x: 0, y: 89.999999, z: 0 },
      ]) {
        const circuit = new Circuit()
        circuit.add(
          <board width={30} height={30} thickness={1.4} routingDisabled>
            <chip
              name="U1"
              footprint="soic8"
              pcbX={3}
              pcbY={-4}
              layer={layer}
              pcbRotation={pcbRotation}
              cadModel={{
                stepUrl: "./test-model.step",
                rotationOffset,
                positionOffset: { x: 1.25, y: -2.5, z: 0.3 },
                zOffsetFromSurface: 2,
                modelOriginPosition: { x: 0.4, y: -0.7, z: 1.1 },
                modelUnitToMmScale: 2,
              }}
            />
          </board>,
        )
        await circuit.renderUntilSettled()
        const json = circuit.getCircuitJson()
        const cad = json.find((e) => e.type === "cad_component")!
        const component = json.find((e) => e.type === "pcb_component")!
        const converter = new CircuitJsonToKicadPcbConverter(json)
        converter.runUntilFinished()
        const model = converter.getOutput().footprints[0]!.models[0]!
        const rotation = model.rotate!
        const offset = model.offset!
        expect(model.scale).toEqual({ x: 2, y: 2, z: 2 })

        for (const vertex of [
          [0, 0, 0],
          [1, 0, 0],
          [0, 2, 0],
          [0, 0, 3],
        ] as Vector[]) {
          const origin = cad.model_origin_position!
          // The viewer subtracts model origin before intrinsic XYZ rotation.
          let expected: Vector = [
            vertex[0] * 2 - origin.x,
            vertex[1] * 2 - origin.y,
            vertex[2] * 2 - origin.z,
          ]
          expected = turn(expected, Z, cad.rotation!.z)
          expected = turn(expected, Y, cad.rotation!.y)
          expected = turn(expected, X, cad.rotation!.x)
          expected = [
            expected[0] + cad.position.x,
            expected[1] + cad.position.y,
            expected[2] + cad.position.z,
          ]

          // KiCad: negative model XYZ angles, local offset, back-side flip,
          // footprint rotation, then translation to the board surface.
          let actual = vertex.map((value) => value * 2) as Vector
          actual = turn(actual, X, -rotation.x)
          actual = turn(actual, Y, -rotation.y)
          actual = turn(actual, Z, -rotation.z)
          actual = [
            actual[0] + offset.x,
            actual[1] + offset.y,
            actual[2] + offset.z,
          ]
          if (layer === "bottom") {
            actual = turn(actual, Z, 180)
            actual = turn(actual, Y, 180)
          }
          actual = turn(actual, Z, component.rotation)
          actual = [
            actual[0] + component.center.x,
            actual[1] + component.center.y,
            actual[2] + (layer === "bottom" ? -0.7 : 0.7),
          ]
          for (let axis = 0; axis < 3; axis++) {
            expect(actual[axis]).toBeCloseTo(expected[axis]!, 8)
          }
        }
      }
    }
  }
}, 30_000)
