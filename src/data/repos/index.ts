
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

export class AppRepos {
  public consent = new ConsentRepo();
  public organizations = new OrganizationsRepo(this.consent);
  public people = new PeopleRepo();
  public interactions = new InteractionsRepo(this.consent);
  public referrals = new ReferralsRepo(this.consent);
  public pipelines = new PipelinesRepo(this.consent);
  public todos = new TodosRepo();
  public advisor = new AdvisorRepo();
  public ecosystems = new EcosystemsRepo();
  public metrics = new MetricsRepo(this.consent);
  public flexibleMetrics = new FlexibleMetricsRepo(); // New Flexible Layer
}
