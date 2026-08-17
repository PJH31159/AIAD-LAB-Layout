type KeyboardKey = Pick<KeyboardEvent, 'code' | 'key'>;
type EditorTool = 'select' | 'pan' | 'measure' | 'vertices' | 'walls';

const toolShortcuts: Partial<Record<string, EditorTool>> = {
  v: 'select',
  h: 'pan',
  m: 'measure',
  n: 'vertices',
  w: 'walls',
};

export function shortcutLetter(event: KeyboardKey): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  return event.key.toLowerCase();
}

export function toolFromShortcut(event: KeyboardKey): EditorTool | null {
  return toolShortcuts[shortcutLetter(event)] ?? null;
}
