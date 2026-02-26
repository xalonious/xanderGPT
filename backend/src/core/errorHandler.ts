import { ErrorRequestHandler } from 'express';
import ServiceError from './ServiceError';
import { getLogger } from './logging';

const logger = getLogger();

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case 'NOT_FOUND':
        res.status(404).json({ error: err.message });
        break;
      case 'VALIDATION_FAILED':
        res.status(400).json({ error: err.message });
        break;
      case 'UNAUTHORIZED':
        res.status(401).json({ error: err.message });
        break;
      case 'FORBIDDEN':
        res.status(403).json({ error: err.message });
        break;
      case 'CONFLICT':
        res.status(409).json({ error: err.message });
        break;
      case 'INTERNAL_SERVER_ERROR':
        res.status(500).json({ error: err.message });
        logger.error(`Internal server error on ${req.method} ${req.originalUrl}`, err);
        break;
    }
    return;
  }

  logger.error(`Unexpected error on ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Unexpected error occurred' });
};
