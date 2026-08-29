import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["OSC1"],
  pin2: ["GND2"],
  pin3: ["OSC2"],
  pin4: ["GND1"],
} as const

const pinAttributes = {
  pin2: { requiresGround: true },
  pin4: { requiresGround: true },
} as const

const footprinterPinLabels = {
  ...pinLabels,
  pin4: [...pinLabels["pin4"], "pin1"],
  pin1: [...pinLabels["pin1"], "pin2"],
  pin2: [...pinLabels["pin2"], "pin3"],
  pin3: [...pinLabels["pin3"], "pin4"],
} as const

export const X322525MRB4SI = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={footprinterPinLabels}
      pinAttributes={pinAttributes}
      symbol={
        <symbol>
          <schematicpath
            points={[
              { x: -0.1, y: -0.08 },
              { x: -0.1, y: 0.08 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: 0.06, y: -0.14 },
              { x: -0.06, y: -0.14 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: 0.1, y: -0.08 },
              { x: 0.1, y: 0.08 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: -0.06, y: -0.14 },
              { x: -0.06, y: 0.14 },
              { x: 0.06, y: 0.14 },
              { x: 0.06, y: -0.14 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: 0.4, y: 0.2 },
              { x: 0.2, y: 0.2 },
              { x: 0.2, y: 0 },
              { x: 0.12, y: 0 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: -0.4, y: -0.2 },
              { x: -0.2, y: -0.2 },
              { x: -0.2, y: 0 },
              { x: -0.12, y: 0 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: 0.1, y: -0.14 },
              { x: 0.1, y: 0.14 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: -0.1, y: -0.14 },
              { x: -0.1, y: 0.14 },
            ]}
            strokeColor="#880011"
          />
          <schematicpath
            points={[
              { x: 0.06, y: 0.14 },
              { x: 0.06, y: -0.14 },
              { x: -0.06, y: -0.14 },
              { x: -0.06, y: 0.14 },
              { x: 0.06, y: 0.14 },
            ]}
            strokeColor="#880011"
          />
          <port
            name="pin4"
            pinNumber={4}
            aliases={["GND1", "GND"]}
            direction="left"
            schX={-0.6}
            schY={0.2}
            schStemLength={0.2}
          />
          <port
            name="pin2"
            pinNumber={2}
            aliases={["GND2", "GND"]}
            direction="right"
            schX={0.6}
            schY={-0.2}
            schStemLength={0.2}
          />
          <schematicrect
            schX={0}
            schY={0}
            width={0.8}
            height={0.8}
            color="#880000"
          />
          <port
            name="pin1"
            pinNumber={1}
            aliases={["OSC1"]}
            direction="left"
            schX={-0.6}
            schY={-0.2}
            schStemLength={0.2}
          />
          <port
            name="pin3"
            pinNumber={3}
            aliases={["OSC2"]}
            direction="right"
            schX={0.6}
            schY={0.2}
            schStemLength={0.2}
          />
        </symbol>
      }
      supplierPartNumbers={{
        jlcpcb: ["C70593"],
      }}
      manufacturerPartNumber="X322525MRB4SI"
      footprint="dfn4_p1.9mm_w3.6001mm_pw1.2mm_pl1.4mm"
      cadModel={{
        objUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C70593.obj?uuid=3d8e5f33629249f9a4089449c02742d4",
        stepUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C70593.step?uuid=3d8e5f33629249f9a4089449c02742d4",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0.000012699999984988608, z: -0.01 },
      }}
      {...props}
    />
  )
}
