import type { Engine, Trigger } from './core/index.ts';
import type { OutboundLedger } from './outbound-ledger.js';

export class SourceIngress {
  constructor(private readonly engine:Engine,private readonly ledger:OutboundLedger,private readonly admitted:(trigger:Trigger)=>boolean=()=>true) {}
  receive(trigger:Trigger) {
    if(this.ledger.isOwn(trigger))return {kind:'own_outbound' as const};
    return this.engine.receive(this.admitted(trigger)?trigger:{...trigger,meta:{...trigger.meta,admissionDenied:true}});
  }
}
