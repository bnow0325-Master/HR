// Runs in the existing HR app container; the token stays in its environment.
const token = process.env.HR_NOTIFICATION_CRON_TOKEN?.trim();
if (!token) {
  console.error('HR notification scheduler token is not configured');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/internal/hr-notification-dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(100_000),
    });
    if (!response.ok) throw new Error('request failed');
    const value = await response.json();
    // Only aggregate counters. Never log headers, tokens, recipients, or bodies.
    console.log(JSON.stringify({
      summaryDue: value.summary?.due === true,
      queued: value.summary?.queued === true,
      sent: value.delivery?.sent,
      failed: value.delivery?.failed,
      pending: value.delivery?.pending,
      configured: value.delivery?.configured === true,
      chroConfigured: value.delivery?.chroConfigured === true,
      missingCheckoutQueued: value.missingCheckout?.queued,
      missingCheckoutReview: value.missingCheckout?.review,
      missingCheckoutWorking: value.missingCheckout?.working,
    }));
    if (value.delivery?.configured !== true || value.delivery?.failed > 0) process.exitCode = 1;
  } catch {
    console.error('HR notification scheduler request failed');
    process.exitCode = 1;
  }
}
