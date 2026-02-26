import type { Schema, ValidationError, ValidationOptions, PresenceMode } from 'joi';
import type { Request, Response, NextFunction } from 'express';

const JOI_OPTIONS: ValidationOptions = {
  abortEarly: true,
  allowUnknown: false,
  convert: true,
  presence: 'required' as PresenceMode,
};

const formatJoiError = (error: ValidationError) => {
  return error.details.reduce((acc, { message, path }) => {
    acc[path.join('.')] = message;
    return acc;
  }, {} as Record<string, string>);
};

export const validateRequest = (schema: {
  body?: Schema;
  params?: Schema;
  query?: Schema;
}) => (req: Request, res: Response, next: NextFunction): void => {
  const errors: Record<string, Record<string, string>> = {};

  if (schema.body) {
    const { error } = schema.body.validate(req.body, JOI_OPTIONS);
    if (error) errors.body = formatJoiError(error);
  }

  if (schema.params) {
    const { error } = schema.params.validate(req.params, JOI_OPTIONS);
    if (error) errors.params = formatJoiError(error);
  }

  if (schema.query) {
    const { error } = schema.query.validate(req.query, JOI_OPTIONS);
    if (error) errors.query = formatJoiError(error);
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: errors,
    });
    return; 
  }

  next(); 
};