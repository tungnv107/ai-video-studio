import {describe,it,expect} from 'vitest';
import {needsCostConfirmation,isPendingCostStep} from '../../src/domain/retry-costs';
const checkpoint={projectId:'p',hasScript:true};
describe('retry cost classification',()=>{
  it('skips only this project script generation when there is a saved script',()=>{
    const cost={idempotencyKey:'p:script:provider',category:'LLM',status:'UNKNOWN'};
    expect(needsCostConfirmation(cost,checkpoint)).toBe(false);
    expect(needsCostConfirmation(cost,{...checkpoint,hasScript:false})).toBe(true);
    expect(needsCostConfirmation({...cost,idempotencyKey:'other:script:provider'},checkpoint)).toBe(true);
    expect(needsCostConfirmation({...cost,idempotencyKey:'p:research:provider'},checkpoint)).toBe(true);
    expect(needsCostConfirmation({...cost,category:'IMAGE'},checkpoint)).toBe(true);
  });
  it('retains review history without asking for the same old charge again',()=>{
    const cost={idempotencyKey:'p:r1:s1:audio:provider:reviewed:attempt',category:'TTS',status:'UNKNOWN'};
    expect(needsCostConfirmation(cost,checkpoint)).toBe(false);expect(isPendingCostStep(cost,checkpoint)).toBe(false);
    expect(needsCostConfirmation({...cost,idempotencyKey:'p:r1:s1:audio:provider'},checkpoint)).toBe(true);
  });
});
