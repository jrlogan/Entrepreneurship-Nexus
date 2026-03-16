import { getFirebaseAuth } from './firebaseApp';

const normalizeFunctionsRegion = (value?: string) => {
  const raw = (value || '').trim();
  if (!raw) {
    return 'us-central1';
  }

  if (raw === 'central1' || raw === 'uscentral1') {
    return 'us-central1';
  }

  if (raw === 'us-central1') {
    return raw;
  }

  return raw;
};

const getBaseUrl = () => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
  const region = normalizeFunctionsRegion(import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION);

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
    const port = import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || '55001';
    return `http://${host}:${port}/${projectId}/${region}`;
  }

  return `https://${region}-${projectId}.cloudfunctions.net`;
};

export const callHttpFunction = async <TRequest, TResponse>(name: string, payload: TRequest): Promise<TResponse> => {
  const auth = getFirebaseAuth();
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    throw new Error(error?.message || `Unable to reach function ${name}`);
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.error || `Function ${name} failed`;
    throw new Error(message);
  }

  return json as TResponse;
};
