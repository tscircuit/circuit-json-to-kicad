export default (
  <board width={28} height={16} routingDisabled schematicDisabled>
    {["top", "bottom"].map((layer, layerIndex) =>
      [0, 90, 180, 270].map((ccwRotationDegrees, rotationIndex) => (
        <chip
          key={`${layer}_${ccwRotationDegrees}`}
          name={`U${layerIndex * 4 + rotationIndex + 1}`}
          pinLabels={{ pin1: "CONTACT" }}
          layer={layer as "top" | "bottom"}
          pcbX={-9 + rotationIndex * 6}
          pcbY={-3 + layerIndex * 6}
          pcbRotation={ccwRotationDegrees}
          cadModel={{ stepUrl: "https://example.com/contact.step" }}
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
            </footprint>
          }
        />
      )),
    )}
  </board>
)
