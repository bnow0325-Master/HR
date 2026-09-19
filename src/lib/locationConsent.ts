export const LOCATION_CONSENT_VERSION = "2026-09-19";

export function hasCurrentLocationConsent(employee: {
  locationConsentAt: Date | null;
  locationConsentVersion: string | null;
}) {
  return Boolean(
    employee.locationConsentAt &&
      employee.locationConsentVersion === LOCATION_CONSENT_VERSION,
  );
}
