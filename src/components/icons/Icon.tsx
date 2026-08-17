import type { SVGProps } from 'react';

export type IconName =
  | 'brand'
  | 'undo'
  | 'redo'
  | 'save'
  | 'download'
  | 'upload'
  | 'image'
  | 'plus'
  | 'minus'
  | 'fit'
  | 'grid'
  | 'snap'
  | 'panel-left'
  | 'panel-right'
  | 'trash'
  | 'copy'
  | 'lock'
  | 'unlock'
  | 'warning'
  | 'wall'
  | 'door'
  | 'window'
  | 'column'
  | 'outlet'
  | 'lan-port'
  | 'desk'
  | 'meeting-table'
  | 'chair'
  | 'cabinet'
  | 'shelf'
  | 'partition'
  | 'custom'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'search'
  | 'user';

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
  const paths: Partial<Record<IconName, React.ReactNode>> = {
    brand: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16 12 8l4 8M9.5 13h5"/></>,
    undo: <><path d="m9 7-4 4 4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 4 4-4 4"/><path d="M19 11h-8a6 6 0 0 0-6 6"/></>,
    save: <><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 20h14"/></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M5 20h14"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 4 4 2-2 5 4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="7" y="7" width="10" height="10"/></>,
    grid: <><path d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16"/></>,
    snap: <><path d="M6 4v9a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/></>,
    'panel-left': <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
    'panel-right': <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    unlock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></>,
    warning: <><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    wall: <><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 4 4M11 9l4 4M15 5l4 4"/></>,
    door: <><path d="M5 21V4h12v17M9 21V7h8"/><circle cx="14" cy="14" r=".5"/></>,
    window: <><rect x="3" y="5" width="18" height="14"/><path d="M12 5v14M3 12h18"/></>,
    column: <><path d="M6 4h12M7 7h10M8 7v10M16 7v10M7 17h10M6 20h12"/></>,
    outlet: <><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9v3M15 9v3M9 16h6"/></>,
    'lan-port': <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8v6H8zM10 9V7M14 9V7M10 15v2M14 15v2"/></>,
    desk: <><rect x="3" y="5" width="18" height="10" rx="1"/><path d="M6 15v5M18 15v5M8 9h8"/></>,
    'meeting-table': <><rect x="5" y="6" width="14" height="12" rx="5"/><path d="M8 3v3M16 3v3M8 18v3M16 18v3M2 9h3M19 9h3M2 15h3M19 15h3"/></>,
    chair: <><path d="M7 5v8h10V5M8 13v4h8v-4M8 17l-2 4M16 17l2 4"/></>,
    cabinet: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 12h14M10 8h4M10 16h4"/></>,
    shelf: <><rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M4 15h16M8 3v18"/></>,
    partition: <><path d="M3 18 18 3M6 21 21 6M6 18h12V6"/></>,
    custom: <><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/></>,
    'chevron-left': <path d="m15 5-7 7 7 7"/>,
    'chevron-right': <path d="m9 5 7 7-7 7"/>,
    'chevron-down': <path d="m5 9 7 7 7-7"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
