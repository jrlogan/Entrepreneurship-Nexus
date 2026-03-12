import type { Person } from '../people/types';
import { FirebasePeopleRepo } from '../../data/repos/firebase/people';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const firebasePeopleRepo = new FirebasePeopleRepo();

export const resolveSessionPerson = async (authUid?: string | null, email?: string | null): Promise<Person | null> => {
  if (!isFirebaseEnabled()) {
    return null;
  }

  if (authUid) {
    const authUidMatch = await firebasePeopleRepo.getByAuthUid(authUid);
    if (authUidMatch) {
      return authUidMatch;
    }
  }

  if (email) {
    return firebasePeopleRepo.getByEmail(email);
  }

  return null;
};
