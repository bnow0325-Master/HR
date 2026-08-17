export const employeeSelect = {
  id: true,
  code: true,
  name: true,
  department: true,
  position: true,
  email: true,
  phone: true,
  personalEmail: true,
  homeAddress: true,
  emergencyContactPhone: true,
  hireDate: true,
  terminationDate: true,
  workMinutesPerDay: true,
  systemRole: true,
  attendanceEnabled: true,
  leaveEnabled: true,
  workboardEnabled: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function parseDateOnly(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validEmail(email: string | null) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validPhone(phone: string | null) {
  return !phone || /^01\d-\d{3,4}-\d{4}$/.test(phone);
}

export function validContactPhone(phone: string | null) {
  return !phone || /^0\d{1,3}-\d{3,4}-\d{4}$/.test(phone);
}
