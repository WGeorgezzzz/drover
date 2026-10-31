import type { OutboundMessage } from './core/index.ts';
import type { SuperagentStore } from './store.js';
import type { OutboundLedger } from './outbound-ledger.js';

export class OutboxDispatcher {
  private running=false;
  constructor(private readonly store:SuperagentStore,private readonly ledger:OutboundLedger,
    private readonly transport:{enabled(source:string):boolean;actor(source:string):string;send(message:OutboundMessage):Promise<{platformId?:string}>}) {}
  async drain():Promise<void> {while(this.running)await new Promise(resolve=>setTimeout(resolve,50));}
  async pass():Promise<void> {
    if(this.running)return;
    this.running=true;
    try {
      for(const effect of this.store.effects().filter(item=>item.kind==='reply')) {
        const id=String(effect.payload.id),receipt=this.store.receipt(id);
        if(!receipt||receipt.status!=='pending'){this.store.complete(effect.position);continue;}
        if(!this.transport.enabled(receipt.message.channel.source)||!this.store.canSend(id))continue;
        this.ledger.begin(id,this.transport.actor(receipt.message.channel.source));
        try {
          const result=await this.transport.send(receipt.message);
          this.ledger.sent(id,result.platformId);
          this.store.complete(effect.position);
        }catch(error) {
          const uncertain=!(error&&typeof error==='object'&&'definitelyNotSent' in error&&error.definitelyNotSent===true);
          this.store.sendFailed(id,error,uncertain);
          this.store.fail(effect.position,error);
        }
      }
    }finally{this.running=false;}
  }
}
