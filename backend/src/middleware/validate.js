const { HttpError } = require('../utils/http');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] || {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new HttpError(422, 'Data yang dikirim tidak valid. Periksa kembali isian Anda.', 'VALIDATION_ERROR', details));
    }
    req.valid = result.data;
    next();
  };
}

module.exports = { validate };
