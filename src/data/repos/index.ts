
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
import { LocalNetworkViewSource, RemoteNetworkViewSource, type NetworkViewSource } from '../networkView';
import { FirebaseNetworkProfilesRepo, LocalNetworkProfilesRepo, type NetworkProfilesRepo } from './networkProfiles';
import { LocalNetworkStatsSource, RemoteNetworkStatsSource, type NetworkStatsSource } from '../networkStats';
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
  /** The privacy-filtered view of the network every cross-org read goes through. */
  public networkView: NetworkViewSource;
  /** The founder's own directory and sharing choices. */
  public networkProfiles: NetworkProfilesRepo;
  /** Anonymous aggregate statistics for the network. */
  public networkStats: NetworkStatsSource;

  constructor() {
      const useFirebase = isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE;
      this.networkView = useFirebase ? new RemoteNetworkViewSource() : new LocalNetworkViewSource();
      this.networkStats = useFirebase ? new RemoteNetworkStatsSource() : new LocalNetworkStatsSource();
      this.networkProfiles = useFirebase ? new FirebaseNetworkProfilesRepo() : new LocalNetworkProfilesRepo();
      this.consent = useFirebase ? new FirebaseConsentRepo() : new ConsentRepo();
      this.ecosystems = useFirebase ? new FirebaseEcosystemsRepo() : new EcosystemsRepo();
      
      this.organizations = useFirebase ? new FirebaseOrganizationsRepo(this.consent, this.networkView) : new OrganizationsRepo(this.consent, this.networkView);
      this.people = useFirebase ? new FirebasePeopleRepo(this.networkView) : new PeopleRepo(this.networkView);
      this.referrals = useFirebase ? new FirebaseReferralsRepo(this.networkView) : new ReferralsRepo(this.networkView);
      this.inboundMessages = useFirebase ? new FirebaseInboundMessagesRepo() : new InboundMessagesRepo();
      this.interactions = useFirebase ? new FirebaseInteractionsRepo(this.networkView) : new InteractionsRepo(this.networkView);
      this.services = useFirebase ? new FirebaseServicesRepo(this.networkView) : new ServicesRepo(this.networkView);
  }
}
