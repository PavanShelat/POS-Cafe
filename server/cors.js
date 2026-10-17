// CORS_ORIGIN is a comma-separated list. An entry may use "*" as a wildcard, e.g.
// "https://pos-cafe.vercel.app,https://pos-cafe-*.vercel.app" to also allow Vercel
// preview deploys. Unset means any origin (fine locally; set it in production).
function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .map((entry) => {
      if (!entry.includes("*")) return entry;
      const pattern = entry.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*");
      return new RegExp(`^${pattern}$`);
    });
}

function createCorsOriginCheck(value) {
  const allowed = parseAllowedOrigins(value);
  if (allowed.length === 0) return true;

  return (origin, callback) => {
    // Requests without an Origin header (curl, server-to-server, Razorpay
    // webhooks) aren't subject to CORS.
    if (!origin) return callback(null, true);
    const ok = allowed.some((entry) => (typeof entry === "string" ? entry === origin : entry.test(origin)));
    return callback(null, ok);
  };
}

export { createCorsOriginCheck };
