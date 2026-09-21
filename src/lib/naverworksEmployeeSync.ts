import type { NaverWorksEmployeeRosterRow } from "./naverworksEmployeeRoster";

export type EmployeeForNaverWorksSync = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  externalLoginId: string | null;
  active: boolean;
};

export type NaverWorksEmployeeSyncAction = "UNCHANGED" | "MAP_LOGIN" | "UNMATCHED" | "INACTIVE" | "CONFLICT";

export type NaverWorksEmployeeSyncItem = {
  row: NaverWorksEmployeeRosterRow;
  employee: EmployeeForNaverWorksSync | null;
  action: NaverWorksEmployeeSyncAction;
};

export function buildNaverWorksEmployeeSyncPlan(
  rows: NaverWorksEmployeeRosterRow[],
  employees: EmployeeForNaverWorksSync[],
) {
  const byLogin = new Map(
    employees
      .filter((employee) => employee.externalLoginId)
      .map((employee) => [employee.externalLoginId!.toLowerCase(), employee]),
  );
  const byEmail = new Map(
    employees.filter((employee) => employee.email).map((employee) => [employee.email!.toLowerCase(), employee]),
  );
  const nameCounts = new Map<string, number>();
  employees.forEach((employee) => nameCounts.set(employee.name, (nameCounts.get(employee.name) ?? 0) + 1));
  const byUniqueName = new Map(
    employees
      .filter((employee) => nameCounts.get(employee.name) === 1)
      .map((employee) => [employee.name, employee]),
  );

  const items: NaverWorksEmployeeSyncItem[] = rows.map((row) => {
    const employee = byLogin.get(row.loginId) ?? byEmail.get(row.loginId) ?? byUniqueName.get(row.name) ?? null;
    if (!employee) return { row, employee: null, action: "UNMATCHED" };
    if (!employee.active) return { row, employee, action: "INACTIVE" };
    if (employee.externalLoginId && employee.externalLoginId.toLowerCase() !== row.loginId) {
      return { row, employee, action: "CONFLICT" };
    }
    return { row, employee, action: employee.externalLoginId ? "UNCHANGED" : "MAP_LOGIN" };
  });

  return {
    items,
    summary: {
      sourceRows: rows.length,
      matchedEmployees: new Set(items.filter((item) => item.employee).map((item) => item.employee!.id)).size,
      loginMappings: items.filter((item) => item.action === "MAP_LOGIN").length,
      unchangedRows: items.filter((item) => item.action === "UNCHANGED").length,
      unmatchedRows: items.filter((item) => item.action === "UNMATCHED").length,
      inactiveRows: items.filter((item) => item.action === "INACTIVE").length,
      conflictingRows: items.filter((item) => item.action === "CONFLICT").length,
      unmatchedSamples: items
        .filter((item) => item.action === "UNMATCHED")
        .slice(0, 20)
        .map((item) => ({ rowNumber: item.row.rowNumber, name: item.row.name, loginId: item.row.loginId })),
    },
  };
}
