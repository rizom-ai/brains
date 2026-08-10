import type {
  ApplyProjectionRuleResultInput,
  ClaimProjectionWaveInput,
  GetProjectionRuleMemoInput,
  IProjectionStore,
  MarkProjectionDirtyInput,
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
  ): Promise<ProjectionWaveRule> {
    return this.requestRemote<ProjectionWaveRule>({
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
}
