 // error.middleware.js
 //
 // Centralized Express error handler.
 //
 // It normalizes common errors into a consistent JSON response:
 // - Multer upload errors (file too large / unexpected field)
 // - Mongo duplicate key errors
 // - generic 500 fallback
 export default function errorMiddleware(err, req, res, next) {
  let statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  let message = err?.message || "Internal Server Error";

  if (err?.name === "MulterError") {
    statusCode = 400;
    if (err?.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      message = "File too large";
    } else if (err?.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field";
    } else {
      message = err?.message || "Upload error";
    }
  }

  if (err?.code === 11000) {
    statusCode = 409;
    const keys = err?.keyValue ? Object.keys(err.keyValue) : [];
    const key = keys.length ? keys[0] : "field";
    message = `${key} already exists`;
  }

  if (res.headersSent) {
    return next(err);
  }

  if (process.env.NODE_ENV === "production" && statusCode >= 500) {
    message = "Internal Server Error";
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
}
