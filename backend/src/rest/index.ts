import type { Express } from 'express';
import healthRouter from './healthRouter';
import conversationRouter from './conversationRouter';
import authRouter from './authRouter';
import { errorHandler } from '../core/errorHandler';
import { requireAuthentication } from '../core/authMiddleware';

export default function installRest(app: Express) {
  app.use('/api/health', healthRouter);
  app.use('/api/conversations', requireAuthentication, conversationRouter);
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
}