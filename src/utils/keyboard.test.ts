import { describe, expect, it } from 'vitest';
import { shortcutLetter, toolFromShortcut } from './keyboard';

describe('키보드 단축키', () => {
  it('입력 문자와 무관하게 물리 키 코드로 도구를 전환합니다.', () => {
    expect(toolFromShortcut({ code: 'KeyH', key: 'ㅗ' })).toBe('pan');
    expect(toolFromShortcut({ code: 'KeyV', key: 'Process' })).toBe('select');
    expect(toolFromShortcut({ code: 'KeyM', key: 'ㅡ' })).toBe('measure');
    expect(toolFromShortcut({ code: 'KeyN', key: 'ㅜ' })).toBe('vertices');
    expect(toolFromShortcut({ code: 'KeyW', key: 'ㅈ' })).toBe('walls');
    expect(shortcutLetter({ code: 'KeyZ', key: 'ㅋ' })).toBe('z');
  });

  it('물리 키 코드가 없으면 입력 문자를 대신 사용합니다.', () => {
    expect(shortcutLetter({ code: '', key: 'H' })).toBe('h');
    expect(toolFromShortcut({ code: '', key: 'v' })).toBe('select');
  });

  it('도구 단축키가 아닌 문자는 무시합니다.', () => {
    expect(toolFromShortcut({ code: 'KeyQ', key: 'q' })).toBeNull();
  });
});
