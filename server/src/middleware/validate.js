import { unprocessable } from '../utils/errors.js';

function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

export function validate(schemas) {
  return (req, res, next) => {
    const parsed = {};
    try {
      for (const key of ['body', 'query', 'params']) {
        if (!schemas[key]) {
          parsed[key] = req[key];
          continue;
        }
        const result = schemas[key].safeParse(req[key]);
        if (!result.success) {
          throw unprocessable('Some fields need your attention.', formatIssues(result.error));
        }
        parsed[key] = result.data;
      }
      req.valid = parsed;
      if (schemas.body) req.body = parsed.body;
      next();
    } catch (error) {
      next(error);
    }
  };
}
