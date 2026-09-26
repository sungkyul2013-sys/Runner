// The in-mode frame for this page's UI: the PC frame (Shell) or the phone frame (MobileShell). Modes build on the
// shared ModeShell contract only.
import { MobileShell } from './mobile/MobileShell';
import { isMobileUi } from './platform';
import { Shell, type ModeShell, type ShellActions } from './Shell';

export function createShell(title: string, subtitle: string, actions: ShellActions, sheetOpen?: boolean): ModeShell {
  return isMobileUi() ? new MobileShell(title, subtitle, actions, sheetOpen ?? false) : new Shell(title, subtitle, actions, sheetOpen);
}
