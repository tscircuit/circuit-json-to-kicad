import { Fragment } from "react"

export default (
  <board width={42} height={22} routingDisabled schematicDisabled>
    {(["top", "bottom"] as const).map((layer, layerIndex) =>
      [0, 90, 180, 270, 45].map((ccwRotationDegrees, rotationIndex) => (
        <Fragment key={`${layer}_${ccwRotationDegrees}`}>
          <pcbnotetext
            text={`${layer} ${ccwRotationDegrees} deg`}
            pcbX={-16 + rotationIndex * 8}
            pcbY={-5 + layerIndex * 10 + 3.5}
            fontSize={0.55}
          />
          <chip
            name={`U${layerIndex * 5 + rotationIndex + 1}`}
            layer={layer}
            pcbX={-16 + rotationIndex * 8}
            pcbY={-5 + layerIndex * 10}
            pcbRotation={ccwRotationDegrees}
            footprint={
              <footprint>
                <platedhole
                  shape="circle"
                  holeDiameter={0.78}
                  outerDiameter={1.3}
                  portHints={["1"]}
                />
                <smtpad
                  shape="circle"
                  radius={0.32}
                  pcbX={0.6}
                  pcbY={0.6}
                  layer="top"
                  portHints={["1"]}
                />
                <courtyardcircle pcbX={0.135} pcbY={0.135} radius={1.6} />
                <fabricationnoterect
                  pcbX={1.1}
                  pcbY={0.5}
                  width={1.3}
                  height={0.7}
                  strokeWidth={0.1}
                />
                <pcbnoterect
                  pcbX={-0.9}
                  pcbY={-0.7}
                  width={0.8}
                  height={1.2}
                  strokeWidth={0.1}
                />
              </footprint>
            }
          />
        </Fragment>
      )),
    )}
  </board>
)
