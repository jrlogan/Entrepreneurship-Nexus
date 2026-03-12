import { httpsCallable } from 'firebase/functions';
import { getFunctionsClient } from './firebaseApp';

export const callFunction = async <TRequest, TResponse>(name: string, payload: TRequest): Promise<TResponse> => {
  const functions = getFunctionsClient();
  if (!functions) {
    throw new Error('Firebase functions are not configured.');
  }

  const callable = httpsCallable<TRequest, TResponse>(functions, name);
  const result = await callable(payload);
  return result.data;
};
