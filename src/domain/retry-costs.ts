type CostStep = {idempotencyKey: string; category: string; status: string};
type Checkpoint = {projectId:string;hasScript:boolean;revision?:number;assets?:{revision:number;sceneOrder:number;kind:string}[]};

export function isPendingCostStep(cost: CostStep, checkpoint: Checkpoint) {
  // Reviewed keys are retained for accounting, but are never called by the worker.
  if (cost.idempotencyKey.includes(':reviewed:')) return false;
  // The worker reads the saved script instead of calling the script provider again.
  if (checkpoint.hasScript && cost.category === 'LLM' && cost.idempotencyKey.startsWith(checkpoint.projectId + ':script:')) return false;
  if(checkpoint.revision!==undefined&&cost.idempotencyKey.startsWith(checkpoint.projectId+':')){
    const step=cost.idempotencyKey.slice(checkpoint.projectId.length+1),version=/^r(\d+):/.exec(step);
    if(version&&Number(version[1])<checkpoint.revision)return false;
    const scene=/^r(\d+):s(\d+):(image|audio)(?::|$)/.exec(step);
    if(scene&&Number(scene[1])===checkpoint.revision){
      const kind=scene[3]==='image'?'IMAGE':'AUDIO',category=scene[3]==='image'?'IMAGE':'TTS';
      if(cost.category===category&&checkpoint.assets?.some(a=>a.revision===checkpoint.revision&&a.sceneOrder===Number(scene[2])&&a.kind===kind))return false;
    }
  }
  return true;
}

export function needsCostConfirmation(cost: CostStep, checkpoint: Checkpoint) {
  return ['UNKNOWN', 'RESERVED'].includes(cost.status) && isPendingCostStep(cost, checkpoint);
}
