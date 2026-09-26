import { describe, expect, it } from 'vitest';
import { resolvePlatform } from './platform';
import { parseSettings } from './settings';

describe('UI platform (phone UI / PC UI)', () => {
  it('follows the URL first, then the setting', () => {
    expect(resolvePlatform('desktop', '?ui=mobile')).toBe('mobile');
    expect(resolvePlatform('mobile', '?ui=desktop')).toBe('desktop');
    expect(resolvePlatform('mobile', '')).toBe('mobile');
    expect(resolvePlatform('desktop', '?ui=tablet')).toBe('desktop');
  });
  it('auto without a touch-only screen is the PC UI', () => {
    expect(resolvePlatform('auto', '')).toBe('desktop'); // no matchMedia here: no coarse pointer
  });
  it('stored layouts are validated', () => {
    expect(parseSettings(JSON.stringify({ uiLayout: 'mobile' })).uiLayout).toBe('mobile');
    expect(parseSettings(JSON.stringify({ uiLayout: 'watch' })).uiLayout).toBe('auto');
    expect(parseSettings(null).uiLayout).toBe('auto');
  });
});
