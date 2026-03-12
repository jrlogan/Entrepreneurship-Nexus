const authHost = process.env.VITE_FIREBASE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
const authPort = process.env.VITE_AUTH_EMULATOR_PORT || '59099';
const apiKey = process.env.FIREBASE_WEB_API_KEY || 'local-only-api-key';

const buildUrl = (path) => `http://${authHost}:${authPort}/identitytoolkit.googleapis.com/v1/${path}?key=${apiKey}`;

export const signInWithPassword = async (email, password) => {
  const response = await fetch(buildUrl('accounts:signInWithPassword'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Unable to sign in against auth emulator.');
  }

  return json;
};

export const signUpWithPassword = async (email, password, displayName = '') => {
  const response = await fetch(buildUrl('accounts:signUp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      displayName,
      returnSecureToken: true,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Unable to sign up against auth emulator.');
  }

  return json;
};
