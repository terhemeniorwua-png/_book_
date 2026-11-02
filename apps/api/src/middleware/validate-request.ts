import type { RequestHandler } from 'express';
import type Joi from 'joi';

type RequestPart = 'body' | 'query' | 'params';
type Schemas = Partial<Record<RequestPart, Joi.Schema>>;

export function validateRequest(schemas: Schemas): RequestHandler {
  return (request, _response, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const { error, value } = schema.validate(request[part], {
        abortEarly: false, convert: true, allowUnknown: false, stripUnknown: false,
      });
      if (error) {
        const validationError = Object.assign(new Error('Request validation failed'), {
          status: 400, code: 'VALIDATION_ERROR',
        });
        return next(validationError);
      }
      Object.assign(request, { [part]: value });
    }
    return next();
  };
}
