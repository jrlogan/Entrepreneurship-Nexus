
import { OrganizationsRepo } from './organizations';
import { PeopleRepo } from './people';
import { InteractionsRepo } from './interactions';
import { ReferralsRepo } from './referrals';
import { PipelinesRepo } from './pipelines';
import { ConsentRepo } from './consent';
import { TodosRepo } from './todosRepo';
import { AdvisorRepo } from './advisorRepo';
import { EcosystemsRepo } from './ecosystems';
import { MetricsRepo } from './metrics';
import { FlexibleMetricsRepo } from './metricsRepo';
import { InboundMessagesRepo } from './inboundMessages';
import { ServicesRepo } from './services';
import { GrantsRepo } from './grants';

import { FirebasePeopleRepo } from './firebase/people';
import { FirebaseReferralsRepo } from './firebase/referrals';
import { FirebaseInboundMessagesRepo } from './firebase/inboundMessages';
import { FirebaseInteractionsRepo } from './firebase/interactions';
import { FirebaseOrganizationsRepo } from './firebase/organizations';
import { FirebasePipelinesRepo } from './firebase/pipelines';
import { FirebaseServicesRepo } from './firebase/services';
import { FirebaseGrantsRepo } from './firebase/grants';
import { FirebaseConsentRepo } from './firebase/consent';
import { CONFIG } from '../../app/config';
import { isFirebaseEnabled } from '../../services/firebaseApp';

export class AppRepos {
  public consent: ConsentRepo;
  public organizations: OrganizationsRepo | FirebaseOrganizationsRepo;
  public people: PeopleRepo | FirebasePeopleRepo;
  public interactions: InteractionsRepo | FirebaseInteractionsRepo;
  public referrals: ReferralsRepo | FirebaseReferralsRepo;
  public pipelines: PipelinesRepo | FirebasePipelinesRepo;
  public todos = new TodosRepo();
  public advisor = new AdvisorRepo();
  public ecosystems = new EcosystemsRepo();
  public metrics: MetricsRepo;
  public flexibleMetrics = new FlexibleMetricsRepo(); // New Flexible Layer
  public inboundMessages: InboundMessagesRepo | FirebaseInboundMessagesRepo;
  public services: ServicesRepo | FirebaseServicesRepo;
  public grants: GrantsRepo | FirebaseGrantsRepo;

  constructor() {
      const useFirebase = isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE;
      this.consent = useFirebase ? new FirebaseConsentRepo() : new ConsentRepo();
      this.metrics = new MetricsRepo(this.consent);
      
      this.organizations = useFirebase ? new FirebaseOrganizationsRepo(this.consent) : new OrganizationsRepo(this.consent);
      this.people = useFirebase ? new FirebasePeopleRepo() : new PeopleRepo();
      this.referrals = useFirebase ? new FirebaseReferralsRepo() : new ReferralsRepo(this.consent);
      this.inboundMessages = useFirebase ? new FirebaseInboundMessagesRepo() : new InboundMessagesRepo();
      this.interactions = useFirebase ? new FirebaseInteractionsRepo() : new InteractionsRepo(this.consent);
      this.pipelines = useFirebase ? new FirebasePipelinesRepo(this.consent) : new PipelinesRepo(this.consent);
      this.services = useFirebase ? new FirebaseServicesRepo() : new ServicesRepo();
      this.grants = useFirebase ? new FirebaseGrantsRepo() : new GrantsRepo();
  }
}
