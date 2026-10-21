import { pixelPalette } from "@/components/pixel-friends";

export function PixelSprite({ rows, label, className = "h-16 w-16" }: { rows: string[]; label: string; className?: string }) {
  const cells = rows.flatMap((row, y) =>
    [...row].flatMap((mark, x) => {
      const fill = pixelPalette[mark];
      if (!fill) {
        return [];
      }
      return [<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />];
    }),
  );
  return (
    <svg viewBox="0 0 16 16" className={className} role="img" aria-label={label} shapeRendering="crispEdges">
      {cells}
    </svg>
  );
}
