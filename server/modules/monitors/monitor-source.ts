import type { MonitorProbeEvent } from '@/shared/types.js';
let sink:((id:string,event:MonitorProbeEvent)=>void)|undefined;
let owns:((id:string)=>boolean)|undefined;
// Superagent attaches only after its persisted Source migration; protected legacy rounds keep their dispatcher.
export function setMonitorSourceHandler(handler?:typeof sink,ownership?:typeof owns):void{sink=handler;owns=ownership;}
// Probe and legacy dispatcher consult one ownership decision, preventing duplicate model side effects.
export function monitorSourceOwns(id:string):boolean{return owns?.(id)??false;}
// Probe publication happens after its durable observation; Source IDs deduplicate recovered observations.
export function publishMonitorSourceEvent(id:string,event:MonitorProbeEvent):void{if(monitorSourceOwns(id))sink?.(id,event);}
