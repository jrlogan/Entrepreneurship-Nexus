/**
 * Anonymous network statistics. Production calls getNetworkStats (computed
 * server-side over every partner's records); the demo runs the same function
 * over the sample data. See functions/src/metrics/networkStats.ts.
 */
import { computeNetworkStats, type NetworkStats, type StatsInput, type StatsWindow } from '../../functions/src/metrics/networkStats';
import type { ViewerContext } from '../domain/access/policy';
import { callHttpFunction } from '../services/httpFunctionClient';
import { buildLocalNetworkData } from './networkView';

export type { NetworkStats, StatsWindow };

export interface NetworkStatsSource {
  get(viewer: ViewerContext, window: StatsWindow): Promise<NetworkStats>;
}

export class RemoteNetworkStatsSource implements NetworkStatsSource {
  async get(viewer: ViewerContext, window: StatsWindow): Promise<NetworkStats> {
    const response = await callHttpFunction<object, { ok: boolean; stats: NetworkStats }>('getNetworkStats', {
      ecosystem_id: viewer.ecosystemId,
      acting_org_id: viewer.orgId || null,
      ...window,
    });
    return response.stats;
  }
}

export class LocalNetworkStatsSource implements NetworkStatsSource {
  async get(viewer: ViewerContext, window: StatsWindow): Promise<NetworkStats> {
    return computeNetworkStats(buildLocalNetworkData(viewer.ecosystemId) as unknown as StatsInput, window);
  }
}
