import express from 'express';

import { requireSharedResourceAdministrator } from '@/modules/auth/index.js';
import { AppError, asyncHandler, createApiSuccessResponse, requireAuthenticatedUserId } from '@/shared/index.js';

import { alwaysOnEnabled, listInbox } from './inbox.service.js';
import { listDecisions, answerDecision } from './decisions.service.js';
import { inspectMemory, requestConsolidation, rollbackMemory, memoryHistory } from './memory.service.js';
import { acceptIngress, bridgeConversation } from './ingress.service.js';

/** Server composition creates routes after auth/database barrels have initialized, avoiding eager middleware cycles. */
export function createAlwaysOnRoutes() {
const alwaysOnRoutes=express.Router();
alwaysOnRoutes.get('/',asyncHandler(async(req,res)=>{
  const userId=requireAuthenticatedUserId(req),target=typeof req.query.target==='string'?req.query.target:undefined;
  res.json(createApiSuccessResponse({enabled:alwaysOnEnabled(),events:listInbox(userId,target),decisions:listDecisions(userId)}));
}));
alwaysOnRoutes.post('/events',asyncHandler(async(req,res)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new AppError('需要事件对象',{statusCode:400});
  res.status(202).json(createApiSuccessResponse(acceptIngress(requireAuthenticatedUserId(req),req.body)));
}));
alwaysOnRoutes.post('/bridge-session',asyncHandler(async(req,res)=>res.json(createApiSuccessResponse(bridgeConversation(requireAuthenticatedUserId(req),req.body?.reset===true)))));
alwaysOnRoutes.post('/decisions/:id/answer',asyncHandler(async(req,res)=>{
  res.json(createApiSuccessResponse(answerDecision(requireAuthenticatedUserId(req),String(req.params.id),req.body?.answer,req.body?.via==='feishu'?'feishu':'app')));
}));
alwaysOnRoutes.get('/memory',requireSharedResourceAdministrator,asyncHandler(async(_req,res)=>res.json(createApiSuccessResponse({inventory:inspectMemory(),history:memoryHistory()}))));
alwaysOnRoutes.post('/memory',requireSharedResourceAdministrator,asyncHandler(async(req,res)=>res.status(202).json(createApiSuccessResponse(requestConsolidation(requireAuthenticatedUserId(req))))));
alwaysOnRoutes.post('/memory/rollback',requireSharedResourceAdministrator,asyncHandler(async(req,res)=>res.json(createApiSuccessResponse(rollbackMemory(String(req.body?.stamp||''))))));
return alwaysOnRoutes;
}
