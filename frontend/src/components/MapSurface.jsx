export default function MapSurface({ children }) {
  return <>
    <svg className="map-shape-def" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><clipPath id="propsight-map-shape" clipPathUnits="objectBoundingBox">
        <path d="M .42 0 H .96 Q 1 0 1 .04 V .96 Q 1 1 .96 1 H .04 Q 0 1 0 .96 V .32 Q 0 .28 .04 .28 H .15 Q .20 .28 .20 .23 V .19 Q .20 .15 .24 .15 H .35 Q .40 .15 .40 .10 V .04 Q .40 0 .42 0 Z" />
      </clipPath></defs>
    </svg>
    <div className="map-surface">{children}</div>
  </>
}
