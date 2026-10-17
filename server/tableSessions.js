const HOUR_MS = 60 * 60 * 1000;

// Hours after which an unlocked table locks itself again, so a photographed QR
// can't be used to order remotely later. Unset or invalid falls back to 12.
function getAutoRelockHours(value = process.env.TABLE_AUTO_RELEASE_HOURS) {
  const hours = value === undefined || value === "" ? 12 : Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : 12;
}

// Clears customer sessions that were opened more than `hours` ago. Only the QR
// ordering lock changes; the table's occupied/available status is left to staff.
async function relockExpiredTables(prisma, hours, now = new Date()) {
  const cutoff = new Date(now.getTime() - hours * HOUR_MS);
  const { count } = await prisma.table.updateMany({
    where: {
      customer_session_token: { not: null },
      customer_session_started_at: { lt: cutoff },
    },
    data: { customer_session_token: null, customer_session_started_at: null },
  });
  return count;
}

export { getAutoRelockHours, relockExpiredTables };
