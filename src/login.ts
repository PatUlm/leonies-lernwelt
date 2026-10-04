import { createKeypad } from './shared/keypad';
import { skyLayer } from './shared/decor';
import { ApiError, sync } from './shared/sync';

type Mode = 'login' | 'signup';

function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
  switch (err.code) {
    case 'offline':
      return 'Keine Verbindung zum Internet. Bitte später noch einmal versuchen.';
    case 'wrong_login':
      return 'Name oder PIN stimmt nicht.';
    case 'name_taken':
      return 'Diesen Namen gibt es schon. Bitte anmelden oder einen anderen Namen wählen.';
    case 'invalid_name':
    case 'invalid_login':
      return 'Der Name braucht 2 bis 20 Buchstaben oder Ziffern.';
    case 'too_many_attempts':
      return `Zu viele Versuche. Bitte in ${Math.ceil((err.retryAfterSeconds ?? 60) / 60)} Minuten noch einmal.`;
    default:
      return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
  }
}

/**
 * "Wer lernt hier?": sign in with name and 4-digit PIN, create a profile, or
 * play on this device only. Calls `done` when a choice was made.
 */
export function renderLogin(app: HTMLElement, done: () => void): () => void {
  let mode: Mode = 'login';
  let pin = '';
  let confirmPin: string | null = null;
  /** Name a login did not find; the sign-up then only asks for the PIN again. */
  let unknownName: string | null = null;
  let busy = false;

  app.className = 'login-page';
  app.innerHTML = `
    ${skyLayer('dashboard')}
    <main class="login">
      <h1>Wer lernt hier?</h1>
      <p class="login-intro" data-ref="intro"></p>
      <label class="login-field">
        <span>Name</span>
        <input data-ref="name" type="text" autocomplete="username" autocapitalize="words" maxlength="20" spellcheck="false" />
      </label>
      <div class="login-field">
        <span data-ref="pinLabel">PIN</span>
        <div class="pin-dots" data-ref="dots" aria-live="polite"></div>
      </div>
      <div data-ref="keypad"></div>
      <p class="login-error" data-ref="error" role="alert"></p>
      <button type="button" class="link-button" data-ref="switch"></button>
      <button type="button" class="link-button quiet" data-ref="local">Ohne Anmeldung spielen (nur auf diesem Gerät)</button>
    </main>`;

  const ref = <T extends HTMLElement>(name: string) => app.querySelector<T>(`[data-ref="${name}"]`)!;
  const nameInput = ref<HTMLInputElement>('name');
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
    ref('intro').textContent =
      mode === 'login'
        ? 'Melde dich mit deinem Namen und deiner PIN an. Dann ist dein Spielstand auf jedem Gerät da.'
        : confirmPin !== null && unknownName === nameInput.value.trim()
          ? `Den Namen „${unknownName}“ gibt es noch nicht. Gib deine PIN noch einmal ein, dann ist dein neues Profil fertig.`
          : 'Neues Profil: Wähle einen Namen und eine geheime PIN aus vier Ziffern.';
    ref('pinLabel').textContent = confirmPin !== null ? 'PIN noch einmal' : 'PIN';
    ref('dots').innerHTML = Array.from({ length: 4 }, (_, i) => `<span class="pin-dot${i < pin.length ? ' filled' : ''}"></span>`).join('');
    ref('switch').textContent = mode === 'login' ? 'Ich bin neu hier – Profil anlegen' : 'Ich habe schon ein Profil – anmelden';
    keypad.setSubmitEnabled(pin.length === 4 && nameInput.value.trim().length >= 2 && !busy);
  }

  function showError(text: string): void {
    ref('error').textContent = text;
  }

  async function submit(): Promise<void> {
    if (busy || pin.length !== 4 || nameInput.value.trim().length < 2) return;
    if (mode === 'signup' && confirmPin === null) {
      confirmPin = pin;
      pin = '';
      showError('');
      render();
      return;
    }
    if (mode === 'signup' && confirmPin !== pin) {
      confirmPin = null;
      pin = '';
      showError('Die beiden PINs sind verschieden. Bitte noch einmal.');
      render();
      return;
    }
    busy = true;
    keypad.setDisabled(true);
    nameInput.disabled = true; // an answer always belongs to the name it was asked for
    ref<HTMLButtonElement>('local').disabled = true;
    ref<HTMLButtonElement>('switch').disabled = true;
    showError('');
    try {
      if (mode === 'login') await sync.login(nameInput.value, pin);
      else await sync.signup(nameInput.value, pin);
    } catch (err) {
      busy = false;
      if (mode === 'login' && err instanceof ApiError && err.code === 'unknown_name') {
        // Keep the PIN as the first entry of a sign-up; the next entry confirms it.
        mode = 'signup';
        confirmPin = pin;
        unknownName = nameInput.value.trim();
        showError('');
      } else {
        confirmPin = null;
        showError(errorText(err));
      }
      pin = '';
      keypad.setDisabled(false);
      nameInput.disabled = false;
      ref<HTMLButtonElement>('local').disabled = false;
      ref<HTMLButtonElement>('switch').disabled = false;
      render();
      return;
    }
    done(); // replaces this page
  }

  nameInput.addEventListener('input', render);
  ref('switch').addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    pin = '';
    confirmPin = null;
    showError('');
    render();
  });
  ref('local').addEventListener('click', () => {
    sync.playLocally();
    done();
  });
  render();
  return () => {};
}
