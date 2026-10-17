function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Known Prisma failures caused by bad input map to 4xx with a safe message.
const PRISMA_ERRORS = {
  P2025: [404, "Record not found"],
  P2002: [409, "That value is already in use"],
  P2003: [409, "This record is still referenced by other records"],
  P2023: [400, "Invalid id"],
  P2007: [400, "Invalid request data"],
};

// For catch blocks. Errors we raised on purpose (with err.status) keep their
// message; anything else is logged and the client gets a generic message, so raw
// database errors never reach the browser.
function sendServerError(res, err) {
  if (err?.status) {
    return sendError(res, err.status, err.message || "Request failed");
  }

  const prismaError = err?.code && PRISMA_ERRORS[err.code];
  if (prismaError) {
    return sendError(res, prismaError[0], prismaError[1]);
  }
  if (err?.name === "PrismaClientValidationError") {
    return sendError(res, 400, "Invalid request data");
  }

  console.error(err);
  return sendError(res, 500, "Something went wrong. Please try again.");
}

export { httpError, sendError, sendServerError };
