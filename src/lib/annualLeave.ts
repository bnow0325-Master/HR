function dateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function anniversary(hireDate: Date, year: number) {
  const hire = dateParts(hireDate);
  const day = Math.min(
    hire.day,
    new Date(Date.UTC(year, hire.month + 1, 0)).getUTCDate(),
  );
  return new Date(Date.UTC(year, hire.month, day));
}

export function completedMonths(hireDate: Date, asOf: Date) {
  const hire = dateParts(hireDate);
  const current = dateParts(asOf);
  let months =
    (current.year - hire.year) * 12 + (current.month - hire.month);
  if (current.day < hire.day) months -= 1;
  return Math.max(0, months);
}

export function completedYears(hireDate: Date, asOf: Date) {
  const hire = dateParts(hireDate);
  const current = dateParts(asOf);
  let years = current.year - hire.year;
  if (
    current.month < hire.month ||
    (current.month === hire.month && current.day < hire.day)
  ) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function statutoryAnnualLeaveDays(hireDate: Date, asOf = new Date()) {
  const months = completedMonths(hireDate, asOf);
  if (months < 12) {
    return Math.min(11, months);
  }

  const years = completedYears(hireDate, asOf);
  return Math.min(25, 15 + Math.floor(Math.max(0, years - 1) / 2));
}

export function currentLeavePeriod(hireDate: Date, asOf = new Date()) {
  const years = completedYears(hireDate, asOf);
  const hire = dateParts(hireDate);

  if (years < 1) {
    const start = new Date(Date.UTC(hire.year, hire.month, hire.day));
    return {
      start,
      end: new Date(anniversary(hireDate, hire.year + 1).getTime()),
    };
  }

  const startYear = hire.year + years;
  const start = anniversary(hireDate, startYear);
  const end = anniversary(hireDate, startYear + 1);
  return { start, end };
}

export function startOfKstDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Calendar dates are stored at UTC midnight so hire-date period comparisons
  // and leave dates share the same boundary regardless of server timezone.
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function minutesToDays(minutes: number, workMinutesPerDay: number) {
  if (workMinutesPerDay <= 0) return 0;
  return Math.round((minutes / workMinutesPerDay) * 100) / 100;
}
