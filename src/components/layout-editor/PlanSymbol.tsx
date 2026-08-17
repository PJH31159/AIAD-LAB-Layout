import { WALL_COLOR } from '../../data/layoutConstants';
import type { LayoutObjectType } from '../../types/layout';
import { doorSwingPath } from '../../utils/doorGeometry';

type PlanSymbolProps = {
  type: LayoutObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  doorHinge?: 'left' | 'right';
  doorSwingSign?: 1 | -1;
  doorOpeningAngle?: number;
};

export function PlanSymbol({ type, x, y, width, height, doorHinge = 'left', doorSwingSign = 1, doorOpeningAngle = 90 }: PlanSymbolProps) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const inset = Math.max(1.5, Math.min(width, height) * 0.12);
  const className = `plan-symbol plan-symbol--${type}`;

  if (type === 'door') {
    const { hingeX, closedX, openX, openY, arcSweep, sector } = doorSwingPath({ x, y, width, height, doorHinge, doorSwingSign, openingAngle: doorOpeningAngle });
    return (
      <g className={className}>
        <path className="plan-symbol__door-hit-area" d={sector} />
        <line className="plan-symbol__door-opening" x1={x - 1} y1={cy} x2={x + width + 1} y2={cy} strokeWidth={Math.max(8, height + 3)} />
        <path className="plan-symbol__guide" d={`M ${closedX} ${cy} A ${width} ${width} 0 0 ${arcSweep ? 1 : 0} ${openX} ${openY}`} />
        <path className="plan-symbol__leaf" d={`M ${hingeX} ${cy} L ${openX} ${openY}`} />
      </g>
    );
  }

  if (type === 'window') {
    return (
      <g className={className}>
        <line className="plan-symbol__wall-opening" x1={x - 1} y1={cy} x2={x + width + 1} y2={cy} strokeWidth={Math.max(8, height + 3)} />
        <line className="plan-symbol__strong-line" x1={x} y1={y + height * 0.24} x2={x + width} y2={y + height * 0.24} />
        <line className="plan-symbol__strong-line" x1={x} y1={y + height * 0.76} x2={x + width} y2={y + height * 0.76} />
        <line className="plan-symbol__line" x1={cx} y1={y} x2={cx} y2={y + height} />
        <line className="plan-symbol__end" x1={x} y1={y} x2={x} y2={y + height} />
        <line className="plan-symbol__end" x1={x + width} y1={y} x2={x + width} y2={y + height} />
      </g>
    );
  }

  if (type === 'outlet') {
    const radius = Math.max(3, Math.min(width, height) * 0.3);
    return (
      <g className={className}>
        <circle className="plan-symbol__line" cx={cx} cy={cy} r={radius} />
        <line className="plan-symbol__line" x1={cx - radius * 0.3} y1={cy - radius * 0.45} x2={cx - radius * 0.3} y2={cy + radius * 0.45} />
        <line className="plan-symbol__line" x1={cx + radius * 0.3} y1={cy - radius * 0.45} x2={cx + radius * 0.3} y2={cy + radius * 0.45} />
        <line className="plan-symbol__mount-line" x1={x} y1={cy} x2={cx - radius} y2={cy} />
      </g>
    );
  }

  if (type === 'lan-port') {
    const portWidth = width * 0.52;
    const portHeight = height * 0.56;
    return (
      <g className={className}>
        <path className="plan-symbol__line" d={`M ${cx - portWidth / 2} ${cy - portHeight / 2} H ${cx + portWidth / 2} V ${cy + portHeight / 2} H ${cx - portWidth / 2} Z`} />
        <path className="plan-symbol__line" d={`M ${cx - portWidth * 0.3} ${cy - portHeight / 2} V ${cy - portHeight * 0.12} M ${cx - portWidth * 0.1} ${cy - portHeight / 2} V ${cy - portHeight * 0.12} M ${cx + portWidth * 0.1} ${cy - portHeight / 2} V ${cy - portHeight * 0.12} M ${cx + portWidth * 0.3} ${cy - portHeight / 2} V ${cy - portHeight * 0.12}`} />
        <line className="plan-symbol__mount-line" x1={x} y1={cy} x2={cx - portWidth / 2} y2={cy} />
      </g>
    );
  }

  if (type === 'wall') {
    return <rect className={`${className} plan-symbol__structure`} x={x} y={y} width={width} height={height} fill={WALL_COLOR} stroke={WALL_COLOR} />;
  }

  if (type === 'partition' || type === 'glass-wall') {
    return (
      <g className={className}>
        <line className="plan-symbol__strong-line" x1={x} y1={y + height * 0.34} x2={x + width} y2={y + height * 0.34} />
        <line className="plan-symbol__line" x1={x} y1={y + height * 0.66} x2={x + width} y2={y + height * 0.66} />
        <line className="plan-symbol__end" x1={x} y1={y} x2={x} y2={y + height} />
        <line className="plan-symbol__end" x1={x + width} y1={y} x2={x + width} y2={y + height} />
      </g>
    );
  }

  if (type === 'column') {
    return (
      <g className={className}>
        <rect className="plan-symbol__structure-soft" x={x} y={y} width={width} height={height} />
        <path className="plan-symbol__hatch" d={`M ${x} ${y} L ${x + width} ${y + height} M ${x + width} ${y} L ${x} ${y + height}`} />
      </g>
    );
  }

  if (type === 'chair' || type === 'meeting-chair') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x + width * 0.18} y={y + height * 0.18} width={width * 0.64} height={height * 0.68} rx={Math.min(3, width * 0.04)} />
        <path className="plan-symbol__strong-line" d={`M ${x + width * 0.16} ${y + height * 0.2} Q ${cx} ${y + height * 0.08} ${x + width * 0.84} ${y + height * 0.2}`} />
        <line className="plan-symbol__line" x1={x + width * 0.2} y1={y + height * 0.29} x2={x + width * 0.8} y2={y + height * 0.29} />
        <line className="plan-symbol__line" x1={x + width * 0.28} y1={y + height * 0.86} x2={x + width * 0.22} y2={y + height * 0.96} />
        <line className="plan-symbol__line" x1={x + width * 0.72} y1={y + height * 0.86} x2={x + width * 0.78} y2={y + height * 0.96} />
      </g>
    );
  }

  if (type === 'desk' || type === 'existing-desk') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
        <line className="plan-symbol__line" x1={x} y1={y + height * 0.2} x2={x + width} y2={y + height * 0.2} />
        <rect className="plan-symbol__inner" x={x + width * 0.73} y={y + height * 0.2} width={width * 0.2} height={height * 0.68} />
        <line className="plan-symbol__line" x1={x + width * 0.73} y1={cy} x2={x + width * 0.93} y2={cy} />
        <circle className="plan-symbol__handle" cx={x + width * 0.77} cy={y + height * 0.38} r={1.4} />
        <circle className="plan-symbol__handle" cx={x + width * 0.77} cy={y + height * 0.67} r={1.4} />
      </g>
    );
  }

  if (type === 'meeting-table') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.08} />
        <rect className="plan-symbol__inner" x={x + inset * 0.55} y={y + inset * 0.55} width={Math.max(0, width - inset * 1.1)} height={Math.max(0, height - inset * 1.1)} rx={Math.min(width, height) * 0.05} />
      </g>
    );
  }

  if (type === 'distribution') {
    return (
      <g className={className}>
        <rect className="plan-symbol__structure-soft" x={x} y={y} width={width} height={height} />
        <path className="plan-symbol__strong-line" d={`M ${cx} ${y + height * 0.12} L ${x + width * 0.35} ${cy} H ${cx} L ${x + width * 0.42} ${y + height * 0.88} L ${x + width * 0.68} ${cy} H ${cx}`} />
      </g>
    );
  }

  if (type === 'ac') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.12} />
        <line className="plan-symbol__strong-line" x1={x + width * 0.1} y1={y + height * 0.68} x2={x + width * 0.9} y2={y + height * 0.68} />
        <circle className="plan-symbol__handle" cx={x + width * 0.84} cy={y + height * 0.32} r={Math.max(1.5, height * 0.05)} />
      </g>
    );
  }

  if (type === 'monitor') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.08} />
        <line className="plan-symbol__line" x1={cx} y1={y + height} x2={cx} y2={y + height * 1.35} />
      </g>
    );
  }

  if (type === 'sofa') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.16} />
        <line className="plan-symbol__strong-line" x1={x + width * 0.08} y1={y + height * 0.28} x2={x + width * 0.92} y2={y + height * 0.28} />
        <line className="plan-symbol__line" x1={x + width / 3} y1={y + height * 0.28} x2={x + width / 3} y2={y + height * 0.9} />
        <line className="plan-symbol__line" x1={x + width * 2 / 3} y1={y + height * 0.28} x2={x + width * 2 / 3} y2={y + height * 0.9} />
      </g>
    );
  }

  if (type === 'fridge' || type === 'printer') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
        <line className="plan-symbol__strong-line" x1={x} y1={y + height * 0.38} x2={x + width} y2={y + height * 0.38} />
        <circle className="plan-symbol__handle" cx={x + width * 0.82} cy={y + height * 0.18} r={Math.max(1.5, Math.min(width, height) * 0.04)} />
      </g>
    );
  }

  if (type === 'whiteboard') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
        <line className="plan-symbol__strong-line" x1={x} y1={y + height * 0.78} x2={x + width} y2={y + height * 0.78} />
      </g>
    );
  }

  if (type === 'cabinet') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
        <line className="plan-symbol__line" x1={cx} y1={y} x2={cx} y2={y + height} />
        <line className="plan-symbol__line" x1={x} y1={y + height * 0.16} x2={x + width} y2={y + height * 0.16} />
        <path className="plan-symbol__line" d={`M ${x} ${y + height} L ${cx} ${y + height * 0.16} L ${x + width} ${y + height}`} />
        <circle className="plan-symbol__handle" cx={cx - Math.max(2, width * 0.035)} cy={y + height * 0.55} r={1.5} />
        <circle className="plan-symbol__handle" cx={cx + Math.max(2, width * 0.035)} cy={y + height * 0.55} r={1.5} />
      </g>
    );
  }

  if (type === 'shelf') {
    return (
      <g className={className}>
        <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
        {[1, 2, 3].map((part) => <line key={part} className="plan-symbol__line" x1={x + width * part / 4} y1={y} x2={x + width * part / 4} y2={y + height} />)}
        <line className="plan-symbol__line" x1={x} y1={y + height * 0.22} x2={x + width} y2={y + height * 0.22} />
        <line className="plan-symbol__line" x1={x} y1={y + height * 0.78} x2={x + width} y2={y + height * 0.78} />
      </g>
    );
  }

  return (
    <g className={className}>
      <rect className="plan-symbol__surface" x={x} y={y} width={width} height={height} />
      <path className="plan-symbol__line plan-symbol__custom-guide" d={`M ${x + inset} ${y + inset} L ${x + width - inset} ${y + height - inset} M ${x + width - inset} ${y + inset} L ${x + inset} ${y + height - inset}`} />
    </g>
  );
}

export function PlanSymbolPreview({ type, width, depth }: { type: LayoutObjectType; width: number; depth: number }) {
  let previewWidth = 78;
  let previewHeight = Math.min(42, Math.max(10, previewWidth * depth / width));
  if (type === 'door') {
    previewWidth = 38;
    previewHeight = 6;
  } else if (type === 'outlet' || type === 'lan-port') {
    previewWidth = 48;
    previewHeight = 28;
  } else if (type === 'column' || type === 'chair') {
    previewWidth = 42;
    previewHeight = 42;
  }
  const x = (100 - previewWidth) / 2;
  const y = type === 'door' ? 57 : (68 - previewHeight) / 2;
  return (
    <svg className="plan-symbol-preview" viewBox="0 0 100 68" focusable="false" aria-hidden="true">
      <PlanSymbol type={type} x={x} y={y} width={previewWidth} height={previewHeight} />
    </svg>
  );
}
