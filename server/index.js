import { app } from "./app.js";
import { prisma } from "./prisma.js";
import { getAutoRelockHours, relockExpiredTables } from "./tableSessions.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8787);
const server = app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

server.on("error", (err) => {
  console.error(`API server failed to start on port ${port}:`, err.message);
  process.exit(1);
});

// Re-lock QR ordering on tables that were unlocked too long ago. Runs at startup
// (Render may have slept through the deadline) and then every few minutes.
const RELOCK_INTERVAL_MS = 5 * 60 * 1000;
const relockHours = getAutoRelockHours();

async function runRelockSweep() {
  try {
    const count = await relockExpiredTables(prisma, relockHours);
    if (count > 0) console.log(`Re-locked QR ordering on ${count} table(s) after ${relockHours}h`);
  } catch (err) {
    console.error("Table re-lock sweep failed:", err?.message || err);
  }
}

void runRelockSweep();
setInterval(runRelockSweep, RELOCK_INTERVAL_MS).unref();
