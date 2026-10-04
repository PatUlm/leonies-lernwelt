import { errorText } from './login';
import { skyLayer } from './shared/decor';
import { escapeHtml } from './shared/html';
import { createKeypad } from './shared/keypad';
import { sync } from './shared/sync';

/** Hash route of this page: #/profil-loeschen. */
export const DELETE_PROFILE_ROUTE = 'profil-loeschen';

/**
 * Deletes the signed-in profile after the PIN was entered and a last question
 * was confirmed. Calls `done` afterwards (back to "Wer lernt hier?").
 */
export function renderDeleteProfile(app: HTMLElement, done: () => void): void {
  const name = sync.account()?.name;
  if (!name) {
    done();
    return;
  }
  let pin = '';
  let busy = false;

  app.className = 'login-page';
  app.innerHTML = `
    ${skyLayer('dashboard')}
    <main class="login">
      <h1>Profil löschen</h1>
      <p class="login-intro">
        Das Profil <strong>${escapeHtml(name)}</strong> wird mit dem ganzen Spielstand gelöscht:
        Sterne, Pokale, Abzeichen und Punkte – auf dem Server und auf diesem Gerät.
        Das lässt sich nicht rückgängig machen.
      </p>
      <div class="login-field">
        <span>Zum Bestätigen: deine PIN</span>
        <div class="pin-dots" data-ref="dots" aria-live="polite"></div>
      </div>
      <div data-ref="keypad"></div>
      <p class="login-error" data-ref="error" role="alert"></p>
      <a class="link-button" href="#/">Abbrechen – Profil behalten</a>
    </main>`;

  const ref = <T extends HTMLElement>(name: string) => app.querySelector<T>(`[data-ref="${name}"]`)!;
  const keypad = createKeypad({
    submitLabel: '✓',
    onDigit: (d) => {
      if (pin.length < 4) pin += String(d);
      render();
    },
    onBackspace: () => {
      pin = pin.slice(0, -1);
      render();
    },
    onSubmit: () => void submit(),
  });
  ref('keypad').appendChild(keypad.element);

  function render(): void {
    ref('dots').innerHTML = Array.from({ length: 4 }, (_, i) => `<span class="pin-dot${i < pin.length ? ' filled' : ''}"></span>`).join('');
    keypad.setSubmitEnabled(pin.length === 4 && !busy);
  }

  async function submit(): Promise<void> {
    if (busy || pin.length !== 4) return;
    if (!window.confirm(`Profil „${name}“ wirklich für immer löschen?`)) return;
    busy = true;
    keypad.setDisabled(true);
    ref('error').textContent = '';
    try {
      await sync.deleteProfile(pin);
    } catch (err) {
      busy = false;
      pin = '';
      keypad.setDisabled(false);
      ref('error').textContent = errorText(err);
      render();
      return;
    }
    done();
  }

  render();
}
