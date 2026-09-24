
import { OrganizationsRepo } from './organizations';
import { PeopleRepo } from './people';
import { InteractionsRepo } from './interactions';
import { ReferralsRepo } from './referrals';
import { ConsentRepo } from './consent';
import { EcosystemsRepo } from './ecosystems';
import { InboundMessagesRepo } from './inboundMessages';
import { ServicesRepo } from './services';

import { FirebasePeopleRepo } from './firebase/people';
import { FirebaseReferralsRepo } from './firebase/referrals';
import { FirebaseInboundMessagesRepo } from './firebase/inboundMessages';
import { FirebaseInteractionsRepo } from './firebase/interactions';
import { FirebaseOrganizationsRepo } from './firebase/organizations';
import { FirebaseServicesRepo } from './firebase/services';
import { FirebaseConsentRepo } from './firebase/consent';
import { FirebaseEcosystemsRepo } from './firebase/ecosystems';
import { CONFIG } from '../../app/config';
import { isFirebaseEnabled } from '../../services/firebaseApp';

export class AppRepos {
  public consent: ConsentRepo;
  public organizations: OrganizationsRepo | FirebaseOrganizationsRepo;
  public people: PeopleRepo | FirebasePeopleRepo;
  public interactions: InteractionsRepo | FirebaseInteractionsRepo;
  public referrals: ReferralsRepo | FirebaseReferralsRepo;
  public ecosystems: EcosystemsRepo | FirebaseEcosystemsRepo;
  public inboundMessages: InboundMessagesRepo | FirebaseInboundMessagesRepo;
  public services: ServicesRepo | FirebaseServicesRepo;

  constructor() {
      const useFirebase = isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE;
      this.consent = useFirebase ? new FirebaseConsentRepo() : new ConsentRepo();
      this.ecosystems = useFirebase ? new FirebaseEcosystemsRepo() : new EcosystemsRepo();
      
      this.organizations = useFirebase ? new FirebaseOrganizationsRepo(this.consent) : new OrganizationsRepo(this.consent);
      this.people = useFirebase ? new FirebasePeopleRepo() : new PeopleRepo();
      this.referrals = useFirebase ? new FirebaseReferralsRepo() : new ReferralsRepo(this.consent);
      this.inboundMessages = useFirebase ? new FirebaseInboundMessagesRepo() : new InboundMessagesRepo();
      this.interactions = useFirebase ? new FirebaseInteractionsRepo() : new InteractionsRepo(this.consent);
      this.services = useFirebase ? new FirebaseServicesRepo() : new ServicesRepo();
  }
}
