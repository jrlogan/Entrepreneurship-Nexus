
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

import { FirebasePeopleRepo } from './firebase/people';
import { FirebaseReferralsRepo } from './firebase/referrals';
import { FirebaseInboundMessagesRepo } from './firebase/inboundMessages';
import { FirebaseInteractionsRepo } from './firebase/interactions';
import { FirebaseOrganizationsRepo } from './firebase/organizations';
import { FirebasePipelinesRepo } from './firebase/pipelines';
import { CONFIG } from '../../app/config';
import { isFirebaseEnabled } from '../../services/firebaseApp';

export class AppRepos {
  public consent = new ConsentRepo();
  public organizations: OrganizationsRepo | FirebaseOrganizationsRepo;
  public people: PeopleRepo | FirebasePeopleRepo;
  public interactions: InteractionsRepo | FirebaseInteractionsRepo;
  public referrals: ReferralsRepo | FirebaseReferralsRepo;
  public pipelines: PipelinesRepo | FirebasePipelinesRepo;
  public todos = new TodosRepo();
  public advisor = new AdvisorRepo();
  public ecosystems = new EcosystemsRepo();
  public metrics = new MetricsRepo(this.consent);
  public flexibleMetrics = new FlexibleMetricsRepo(); // New Flexible Layer
  public inboundMessages: InboundMessagesRepo | FirebaseInboundMessagesRepo;

  constructor() {
      const useFirebase = isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE;
      
      this.organizations = useFirebase ? new FirebaseOrganizationsRepo(this.consent) : new OrganizationsRepo(this.consent);
      this.people = useFirebase ? new FirebasePeopleRepo() : new PeopleRepo();
      this.referrals = useFirebase ? new FirebaseReferralsRepo() : new ReferralsRepo(this.consent);
      this.inboundMessages = useFirebase ? new FirebaseInboundMessagesRepo() : new InboundMessagesRepo();
      this.interactions = useFirebase ? new FirebaseInteractionsRepo() : new InteractionsRepo(this.consent);
      this.pipelines = useFirebase ? new FirebasePipelinesRepo(this.consent) : new PipelinesRepo(this.consent);
  }
}
