// STUB — replaced by the UI/audio/save module owner.
import type { GameUI, SaveStore, UiCallbacks } from '../core/types';

export function createUI(root: HTMLElement, cb: UiCallbacks, _save: SaveStore): GameUI {
  const btn = document.createElement('button');
  btn.textContent = 'START';
  btn.style.cssText = 'position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);font-size:24px;padding:12px 32px;';
  root.appendChild(btn);
  btn.onclick = () => cb.onStart();
  return {
    showTitle() { btn.style.display = 'block'; btn.onclick = () => cb.onStart(); },
    showHud() { btn.style.display = 'none'; },
    updateHud() {},
    showResult() { btn.style.display = 'block'; btn.onclick = () => cb.onRetry(); },
    setPaused() {},
    announce() {},
    flashDamage() {},
    pulseGraze() {},
  };
}
