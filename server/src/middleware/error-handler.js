import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side.';
  let details;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'MulterError') {
    status = 400;
    code = 'UPLOAD_ERROR';
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `That file is larger than ${env.MAX_UPLOAD_MB} MB.`
        : error.message;
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON.';
  } else if (error.name === 'ZodError') {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Some fields need your attention.';
    details = error.issues?.map((issue) => ({
      path: issue.path?.join('.') || 'body',
      message: issue.message,
    }));
  } else if (error.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'That value is already in use.';
  } else if (error.code === '23503') {
    status = 400;
    code = 'REFERENCE_ERROR';
    message = 'A related record is missing or no longer available.';
  } else if (error.code === '23514') {
    status = 400;
    code = 'CONSTRAINT_ERROR';
    message = 'That request is not allowed.';
  }

  if (status >= 500) {
    logger.error(
      {
        err: error,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.id,
      },
      'Unhandled request error',
    );
  }

  const payload = { error: { code, message } };
  if (details) payload.error.details = details;
  if (!env.isProduction && status >= 500) payload.error.stack = error.stack;

  res.status(status).json(payload);
}
