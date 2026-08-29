import type {
  ApplyProjectionRuleResultInput,
  BulkMutationInput,
  ClaimProjectionWaveInput,
  DurableBulkMutationChildInput,
  GetProjectionRuleMemoInput,
  IProjectionStore,
  MarkProjectionDirtyInput,
  ProjectionBatchScope,
  ProjectionIncidentDiagnostics,
  ProjectionIncidentInput,
  ProjectionRuleMemoValue,
  ProjectionWaveRuleInput,
} from "./projection-store";
import {
  parseProjectionStoreRpcResult,
  type ProjectionStoreRpcRequest,
  type ProjectionStoreRpcTransport,
} from "./projection-rpc";
import type {
  ProjectionDirtyInput,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
} from "./schema/projection-state";

export class RemoteProjectionStore implements IProjectionStore {
  private readonly transport: ProjectionStoreRpcTransport;
  private readonly assertOpen: () => void;

  public constructor(
    transport: ProjectionStoreRpcTransport,
    assertOpen: () => void,
  ) {
    this.transport = transport;
    this.assertOpen = assertOpen;
  }

  private async requestRemote<T>(
    request: ProjectionStoreRpcRequest,
  ): Promise<T> {
    this.assertOpen();
    const result = await this.transport.request(request);
    return parseProjectionStoreRpcResult(request, result) as T;
  }

  public markDirty(input: MarkProjectionDirtyInput): Promise<number> {
    return this.requestRemote<number>({ operation: "markDirty", input });
  }

  public listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    return this.requestRemote<ProjectionDirtyInput[]>({
      operation: "listPendingInputs",
    });
  }

  public claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    return this.requestRemote<ProjectionWave | null>({
      operation: "claimPendingWave",
      input,
    });
  }

  public listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]> {
    return this.requestRemote<ProjectionWaveInput[]>({
      operation: "listWaveInputs",
      waveId,
    });
  }

  public getWave(waveId: string): Promise<ProjectionWave | null> {
    return this.requestRemote<ProjectionWave | null>({
      operation: "getWave",
      waveId,
    });
  }

  /**
   * Sweep gating runs only in the scheduler (web) process; a worker reaching
   * this is a process-placement mistake, so it refuses rather than proxies.
   */
  public hasActiveProjectionBatch(): Promise<boolean> {
    return Promise.reject(
      new Error(
        "hasActiveProjectionBatch runs in the database owner, not in a worker",
      ),
    );
  }

  public supersedeWaveIfStale(
    waveId: string,
    supersededAt: number,
  ): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "supersedeWaveIfStale",
      waveId,
      supersededAt,
    });
  }

  public getActiveWave(): Promise<ProjectionWave | null> {
    return this.requestRemote<ProjectionWave | null>({
      operation: "getActiveWave",
    });
  }

  public completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    return this.requestRemote<ProjectionWave>({
      operation: "completeWave",
      waveId,
      completedAt,
    });
  }

  public failWave(waveId: string, failedAt: number): Promise<ProjectionWave> {
    return this.requestRemote<ProjectionWave>({
      operation: "failWave",
      waveId,
      failedAt,
    });
  }

  public failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    return this.requestRemote<ProjectionWave>({
      operation: "failWaveWithIncident",
      input,
    });
  }

  public getUnresolvedProjectionIncidentDiagnostics(
    limit?: number,
  ): Promise<ProjectionIncidentDiagnostics> {
    return this.requestRemote<ProjectionIncidentDiagnostics>({
      operation: "getUnresolvedProjectionIncidentDiagnostics",
      limit,
    });
  }

  public putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    return this.requestRemote<void>({
      operation: "putWaveRules",
      waveId,
      rules,
    });
  }

  public listWaveRules(waveId: string): Promise<ProjectionWaveRule[]> {
    return this.requestRemote<ProjectionWaveRule[]>({
      operation: "listWaveRules",
      waveId,
    });
  }

  public queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<ProjectionWaveRule> {
    return this.requestRemote<ProjectionWaveRule>({
      operation: "queueWaveRule",
      waveId,
      ruleId,
      jobId,
    });
  }

  public getWaveRule(
    waveId: string,
    ruleId: string,
  ): Promise<ProjectionWaveRule | null> {
    return this.requestRemote<ProjectionWaveRule | null>({
      operation: "getWaveRule",
      waveId,
      ruleId,
    });
  }

  public applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null> {
    return this.requestRemote<ProjectionWaveRule | null>({
      operation: "applyRuleResult",
      input,
    });
  }

  public getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    return this.requestRemote<ProjectionRuleMemoValue | null>({
      operation: "getRuleMemo",
      input,
    });
  }

  public openCallbackBatch(
    input: BulkMutationInput,
  ): Promise<ProjectionBatchScope> {
    return this.requestRemote<ProjectionBatchScope>({
      operation: "openCallbackBatch",
      input,
    });
  }

  public renewCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    return this.requestRemote<void>({
      operation: "renewCallbackBatch",
      scope,
    });
  }

  public closeCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    return this.requestRemote<void>({
      operation: "closeCallbackBatch",
      scope,
    });
  }

  public openDurableBatchChild(
    input: DurableBulkMutationChildInput,
  ): Promise<ProjectionBatchScope> {
    return this.requestRemote<ProjectionBatchScope>({
      operation: "openDurableBatchChild",
      input,
    });
  }
}
