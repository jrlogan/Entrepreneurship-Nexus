import { useAuthContext } from './AuthProvider';

export const useAuthSession = () => useAuthContext().session;
