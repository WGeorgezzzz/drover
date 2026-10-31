import type { Engine, Trigger } from './core/index.ts';
import type { OutboundLedger } from './outbound-ledger.js';

export class SourceIngress {
  constructor(private readonly engine:Engine,private readonly ledger:OutboundLedger) {}
  receive(trigger:Trigger) {
    if(this.ledger.isOwn(trigger))return {kind:'own_outbound' as const};
    return this.engine.receive(trigger);
  }
}
