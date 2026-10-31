// Plain-language failure messages, busy buttons, and "Try again".

const TEXT = {
  offline: 'Connect to the internet to keep playing',
  'game-off': 'Graduation Day is taking a short break',
  'coming-soon': 'Coming soon',
  insufficient: 'Not enough Treats.',
  'lives-full': 'Your lives are already full.',
  'no-lives': 'Out of lives.',
};

export function failureText(error) {
  return TEXT[error] ?? 'Something went wrong. Please try again.';
}

// Disables the button (and marks it busy) until fn settles.
export async function withBusy(button, fn) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

export function showFailure(app, error, retry) {
  if (retry) app.toast(failureText(error), { action: { label: 'Try again', run: retry } });
  else app.toast(failureText(error));
}
