type Position = { x: number; y: number };

type Options = {
  positions: Map<string, Position>;
  containerWidth: number;
  containerHeight: number;
  maxAxisScale?: number;
};

export function scaleToContainer({
  positions,
  containerWidth,
  containerHeight,
  maxAxisScale,
}: Options): Map<string, Position> {
  if (positions.size === 0) return positions;
  if (!(containerWidth > 0) || !(containerHeight > 0)) return positions;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const { x, y } of positions.values()) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return positions;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;
  if (!(graphWidth > 0) || !(graphHeight > 0)) return positions;

  const graphAspectRatio = graphWidth / graphHeight;
  const containerAspectRatio = containerWidth / containerHeight;
  if (!(graphAspectRatio > 0) || !(containerAspectRatio > 0)) return positions;

  let scaleX = 1;
  let scaleY = 1;

  if (graphAspectRatio < containerAspectRatio) {
    scaleX = containerAspectRatio / graphAspectRatio;
  } else if (graphAspectRatio > containerAspectRatio) {
    scaleY = graphAspectRatio / containerAspectRatio;
  } else {
    return positions;
  }

  if (Number.isFinite(maxAxisScale) && maxAxisScale > 1) {
    scaleX = Math.min(scaleX, maxAxisScale);
    scaleY = Math.min(scaleY, maxAxisScale);
  }

  if (scaleX <= 1 && scaleY <= 1) return positions;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scaled = new Map<string, Position>();

  for (const [id, position] of positions) {
    scaled.set(id, {
      x: centerX + (position.x - centerX) * scaleX,
      y: centerY + (position.y - centerY) * scaleY,
    });
  }

  return scaled;
}
