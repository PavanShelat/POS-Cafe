import https from "node:https";

const RAZORPAY_TIMEOUT_MS = 15000;

function getRazorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const err = new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
    err.status = 500;
    throw err;
  }
  return { keyId, keySecret };
}

function toPaise(amount) {
  const value = Number(amount || 0);
  return Math.round(value * 100);
}

function razorpayRequestJson({ method, path, body }) {
  const { keyId, keySecret } = getRazorpayKeys();
  const payload = body ? JSON.stringify(body) : "";
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.razorpay.com",
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Basic ${auth}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const status = Number(res.statusCode || 0);
          const parsed = data ? safeJsonParse(data) : null;
          if (status >= 200 && status < 300) return resolve(parsed);
          const message =
            status === 401
              ? "Razorpay authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
              : parsed?.error?.description || parsed?.error?.message || `Razorpay request failed (${status})`;
          const err = new Error(message);
          err.status = status || 502;
          return reject(err);
        });
      }
    );

    req.on("error", reject);
    // Without this a hung connection would hold the request (and the order's row
    // lock in /api/payments/razorpay/order) until the socket gives up on its own.
    req.setTimeout(RAZORPAY_TIMEOUT_MS, () => {
      const err = new Error("Razorpay did not respond in time. Please try again.");
      err.status = 504;
      req.destroy(err);
    });
    req.write(payload);
    req.end();
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export { getRazorpayKeys, razorpayRequestJson, toPaise };
