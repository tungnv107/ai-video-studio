type CostStep = {idempotencyKey: string; category: string; status: string};
type Checkpoint = {projectId: string; hasScript: boolean};

export function isPendingCostStep(cost: CostStep, checkpoint: Checkpoint) {
  // Reviewed keys are retained for accounting, but are never called by the worker.
  if (cost.idempotencyKey.includes(':reviewed:')) return false;
  // The worker reads the saved script instead of calling the script provider again.
  if (checkpoint.hasScript && cost.category === 'LLM' && cost.idempotencyKey.startsWith(checkpoint.projectId + ':script:')) return false;
  return true;
}

export function needsCostConfirmation(cost: CostStep, checkpoint: Checkpoint) {
  return ['UNKNOWN', 'RESERVED'].includes(cost.status) && isPendingCostStep(cost, checkpoint);
}
