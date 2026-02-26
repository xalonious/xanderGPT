import express from 'express';
import type { Express } from 'express';
import { initializeData, shutdownData } from './data';
import installMiddlewares from './core/installMiddlewares';
import installRest from './rest';
import { getLogger } from './core/logging';
import dotenv from 'dotenv';

dotenv.config();

export interface Server {
  getApp(): Express;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export default async function createServer(): Promise<Server> {
  const app: Express = express();
  installMiddlewares(app);
  await initializeData();
  installRest(app);

  return {
    getApp: () => app as Express,
    start: () =>
      new Promise<void>((resolve) => {
        const port = process.env.PORT;
        app.listen(port, () => {
          getLogger().info(`🚀 Server listening at http://localhost:${port}`);
          resolve();
        });
      }),
    stop: async () => {
      getLogger().info('👋 Goodbye!');
      app.removeAllListeners();
      await shutdownData();
    },
  };
}