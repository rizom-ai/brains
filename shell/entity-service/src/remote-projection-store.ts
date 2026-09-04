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
  type ProjectionStoreRpcResults,
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

  private async requestRemote<TRequest extends ProjectionStoreRpcRequest>(
    request: TRequest,
  ): Promise<ProjectionStoreRpcResults[TRequest["operation"]]> {
    this.assertOpen();
    const result = await this.transport.request(request);
    return parseProjectionStoreRpcResult<TRequest["operation"]>(
      request,
      result,
    );
  }

  public markDirty(input: MarkProjectionDirtyInput): Promise<number> {
    return this.requestRemote({ operation: "markDirty", input });
  }

  public listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    return this.requestRemote({
      operation: "listPendingInputs",
    });
  }

  public claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    return this.requestRemote({
      operation: "claimPendingWave",
      input,
    });
  }

  public listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]> {
    return this.requestRemote({
      operation: "listWaveInputs",
      waveId,
    });
  }

  public getWave(waveId: string): Promise<ProjectionWave | null> {
    return this.requestRemote({
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
    return this.requestRemote({
      operation: "supersedeWaveIfStale",
      waveId,
      supersededAt,
    });
  }

  public getActiveWave(): Promise<ProjectionWave | null> {
    return this.requestRemote({
      operation: "getActiveWave",
    });
  }

  public completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    return this.requestRemote({
      operation: "completeWave",
      waveId,
      completedAt,
    });
  }

  public failWave(waveId: string, failedAt: number): Promise<ProjectionWave> {
    return this.requestRemote({
      operation: "failWave",
      waveId,
      failedAt,
    });
  }

  public failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    return this.requestRemote({
      operation: "failWaveWithIncident",
      input,
    });
  }

  public getUnresolvedProjectionIncidentDiagnostics(
    limit?: number,
  ): Promise<ProjectionIncidentDiagnostics> {
    return this.requestRemote({
      operation: "getUnresolvedProjectionIncidentDiagnostics",
      limit,
    });
  }

  public putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    return this.requestRemote({
      operation: "putWaveRules",
      waveId,
      rules,
    });
  }

  public listWaveRules(waveId: string): Promise<ProjectionWaveRule[]> {
    return this.requestRemote({
      operation: "listWaveRules",
      waveId,
    });
  }

  public queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<ProjectionWaveRule> {
    return this.requestRemote({
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
    return this.requestRemote({
      operation: "getWaveRule",
      waveId,
      ruleId,
    });
  }

  public applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null> {
    return this.requestRemote({
      operation: "applyRuleResult",
      input,
    });
  }

  public getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    return this.requestRemote({
      operation: "getRuleMemo",
      input,
    });
  }

  public openCallbackBatch(
    input: BulkMutationInput,
  ): Promise<ProjectionBatchScope> {
    return this.requestRemote({
      operation: "openCallbackBatch",
      input,
    });
  }

  public renewCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    return this.requestRemote({
      operation: "renewCallbackBatch",
      scope,
    });
  }

  public closeCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    return this.requestRemote({
      operation: "closeCallbackBatch",
      scope,
    });
  }

  public openDurableBatchChild(
    input: DurableBulkMutationChildInput,
  ): Promise<ProjectionBatchScope> {
    return this.requestRemote({
      operation: "openDurableBatchChild",
      input,
    });
  }
}
