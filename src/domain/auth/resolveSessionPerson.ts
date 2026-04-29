import type { Person } from '../people/types';
import { FirebasePeopleRepo } from '../../data/repos/firebase/people';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const firebasePeopleRepo = new FirebasePeopleRepo();

export const resolveSessionPerson = async (authUid?: string | null, email?: string | null): Promise<Person | null> => {
  if (!isFirebaseEnabled()) {
    return null;
  }

  if (authUid) {
    // Direct doc lookup first: person doc IDs are keyed by auth_uid, and the
    // /people/{personId} read rule allows self-reads when personId == auth.uid.
    // A query on `auth_uid` field would be denied for non-admin users because
    // the rule keys on doc ID, not the indexed field.
    const byId = await firebasePeopleRepo.getById(authUid);
    if (byId) {
      return byId;
    }

    // Legacy fallback for records whose doc ID differs from auth_uid (only
    // succeeds for admins, who have broader read access via isNetworkAdmin).
    const byField = await firebasePeopleRepo.getByAuthUid(authUid);
    if (byField) {
      return byField;
    }
  }

  if (email) {
    return firebasePeopleRepo.getByEmail(email);
  }

  return null;
};
