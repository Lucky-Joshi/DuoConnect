export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message = 'Invalid request.', details) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found.') =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (
  message = 'This action conflicts with the current state.',
  code = 'CONFLICT',
) => new AppError(409, code, message);
export const tooMany = (message = 'Too many requests. Slow down for a moment.') =>
  new AppError(429, 'RATE_LIMITED', message);
export const unprocessable = (message = 'Validation failed.', details) =>
  new AppError(422, 'VALIDATION_ERROR', message, details);
