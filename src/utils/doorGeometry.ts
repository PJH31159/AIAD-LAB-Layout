type DoorSwingPathOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  doorHinge?: 'left' | 'right';
  doorSwingSign?: 1 | -1;
  openingAngle?: number;
};

export function doorSwingPath({
  x,
  y,
  width,
  height,
  doorHinge = 'left',
  doorSwingSign = 1,
  openingAngle = 90,
}: DoorSwingPathOptions) {
  const cy = y + height / 2;
  const hingeX = doorHinge === 'left' ? x : x + width;
  const closedX = doorHinge === 'left' ? x + width : x;
  const radians = Math.max(10, Math.min(180, openingAngle)) * Math.PI / 180;
  const openX = hingeX + (doorHinge === 'left' ? 1 : -1) * Math.cos(radians) * width;
  const openY = cy + doorSwingSign * Math.sin(radians) * width;
  const arcSweep = doorHinge === 'left' ? doorSwingSign === 1 : doorSwingSign === -1;
  return {
    hingeX,
    closedX,
    cy,
    openY,
    arcSweep,
    openX,
    sector: `M ${hingeX} ${cy} L ${closedX} ${cy} A ${width} ${width} 0 ${openingAngle > 180 ? 1 : 0} ${arcSweep ? 1 : 0} ${openX} ${openY} Z`,
  };
}
