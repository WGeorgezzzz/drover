import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ProviderRuntimeContext } from '@/shared/types.js';

const capabilitySchema=z.object({endpoint:z.string().url(),token:z.string().min(32),role:z.enum(['orchestrator','worker'])}).strict();
const shapes={
  orchestrator_read:{resource:z.string().optional()},
  orchestrator_ticket_attach:{ticketId:z.string(),triggerId:z.string(),note:z.string().optional()},
  orchestrator_ticket_note:{ticketId:z.string(),text:z.string()},
  orchestrator_ticket_request_status:{ticketId:z.string()},
  orchestrator_unsubscribe:{thread:z.string()},
  orchestrator_eval_decide:{triggerId:z.string(),evalId:z.string(),kind:z.enum(['accept','ignore','stop','unavailable']),reason:z.string(),title:z.string().optional(),scope:z.string().optional(),acknowledgement:z.string().optional(),ticketId:z.string().optional(),rules:z.array(z.string()).optional()},
  orchestrator_reply:{ticketId:z.string(),purpose:z.enum(['acknowledgement','answer','result','attention']),triggerId:z.string().optional(),question:z.string().optional(),text:z.string()},
  orchestrator_report:{state:z.enum(['progress','waiting','ready','blocked','failed','dropped']),summary:z.string(),question:z.string().nullable().optional(),askedBy:z.string().optional(),answers:z.string().optional()},
  orchestrator_ack:{triggerId:z.string(),text:z.string()},
  orchestrator_thread_follow:{source:z.string(),thread:z.string()},
  orchestrator_thread_unrelated:{thread:z.string(),reason:z.string()},
  orchestrator_trigger_handback:{triggerId:z.string(),reason:z.string()},
};
const descriptions:Record<string,string>={
  orchestrator_ticket_attach:'Attach an original human trigger to an existing ticket without widening its mandate.',
  orchestrator_ticket_note:'Add an internal note to a ticket.',
  orchestrator_ticket_request_status:'Ask an idle worker for its actual status.',
  orchestrator_unsubscribe:'Stop following a thread.',
  orchestrator_read:'Read bounded facts for the current role. Workers can only read their own Ticket and Inputs.',
  orchestrator_eval_decide:'Submit the semantic judgement of a delivered Eval under its current policy. Host enforces the gate and observe mode.',
  orchestrator_reply:'Send one useful acknowledgement, result, answer or structured question through the originating Channel Outbox.',
  orchestrator_report:'Report actual progress or outcome for this Assignment. Use question for one concrete human decision. ready requires verified evidence.',
  orchestrator_ack:'Acknowledge an in-scope human follow-up once, to its original conversation.',
  orchestrator_thread_follow:'Follow a related Thread for context only; this grants no new authority. A false result means the Ticket already follows this Thread.',
  orchestrator_thread_unrelated:'Release an unrelated attached Thread with a reason.',
  orchestrator_trigger_handback:'Hand an owned message back once when it is outside the Ticket mandate.',
};

export function createSuperagentProviderTools(input:unknown) {
  const parsed=capabilitySchema.safeParse(input);
  if(!parsed.success)return [];
  const capability=parsed.data;
  const endpoint=new URL(capability.endpoint);
  if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.protocol!=='http:')throw new Error('Superagent tools require loopback HTTP');
  const names=capability.role==='orchestrator'?['orchestrator_read','orchestrator_eval_decide','orchestrator_reply','orchestrator_ticket_attach','orchestrator_ticket_note','orchestrator_ticket_request_status','orchestrator_unsubscribe']:['orchestrator_read','orchestrator_report','orchestrator_ack','orchestrator_thread_follow','orchestrator_thread_unrelated','orchestrator_trigger_handback'];
  return names.map(name=>{
    const schema=z.object(shapes[name as keyof typeof shapes]).strict();
    return {name,shape:shapes[name as keyof typeof shapes],specification:{name,description:descriptions[name],inputSchema:z.toJSONSchema(schema)},
      async execute(value:unknown) {
        const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+capability.token,'content-type':'application/json'},body:JSON.stringify({name,arguments:schema.parse(value)}),signal:AbortSignal.timeout(30000)});
        const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
      }};
  });
}

export function createSuperagentQuery(input:unknown,baseQuery:NonNullable<ProviderRuntimeContext['createQuery']>=query as NonNullable<ProviderRuntimeContext['createQuery']>):NonNullable<ProviderRuntimeContext['createQuery']> {
  const tools=createSuperagentProviderTools(input);
  if(!tools.length)return baseQuery;
  const server=createSdkMcpServer({name:'superagent',version:'1.0.0',tools:tools.map(entry=>tool(entry.name,descriptions[entry.name],entry.shape,async args=>({content:[{type:'text' as const,text:JSON.stringify(await entry.execute(args))}]})))});
  return request=>baseQuery({...request,options:{...request.options,mcpServers:{...request.options?.mcpServers,superagent:server},allowedTools:[...(request.options?.allowedTools??[]),...tools.map(entry=>'mcp__superagent__'+entry.name)]}});
}

export function parseSuperagentTool(name:string,input:unknown):unknown {
  if(!Object.hasOwn(shapes,name))throw new Error('Unknown superagent tool');
  return z.object(shapes[name as keyof typeof shapes]).strict().parse(input);
}
