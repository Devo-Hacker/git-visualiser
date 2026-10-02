export function notFound(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

// Express recognises error handlers by their four arguments.
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  req.log.error({ err }, "request failed");
  res.status(status).json({
    error: {
      code: status === 500 ? "INTERNAL" : err.code ?? "ERROR",
      message: status === 500 ? "Something went wrong" : err.message,
    },
  });
}