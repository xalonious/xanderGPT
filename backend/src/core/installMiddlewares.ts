import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { loggingMiddleware } from './loggingMiddleware';

dotenv.config();

const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
};

export default function installMiddlewares(app: Express) {
  app.use(cookieParser());
  app.use(cors(corsOptions));
  app.use(helmet());
  app.use(loggingMiddleware)
  app.use(express.json({ limit: '30mb' }));
}
