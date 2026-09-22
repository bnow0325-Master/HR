import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseNaverWorksAbsenceWorkbook } from "../src/lib/naverworksAbsence";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: tsx scripts/generate-naverworks-absence-sql.ts <input.xlsx> <output.sql>");

const escapeSql = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "''");
const dateValue = (value: Date | null) => value ? `'${value.toISOString().slice(0, 10)}'` : "NULL";
const rows = parseNaverWorksAbsenceWorkbook(readFileSync(resolve(input)));

const statements = rows.map((row) => {
  const values = [
    `'${escapeSql(row.documentNo)}'`,
    `'${escapeSql(row.name)}'`,
    row.department ? `'${escapeSql(row.department)}'` : "NULL",
    `'${escapeSql(row.absenceType)}'`,
    String(row.unitsMinutes),
    `'${escapeSql(row.periodText)}'`,
    dateValue(row.requestedOn),
    String(row.rowNumber),
    `'${escapeSql(row.name)}'`,
  ];
  return `INSERT INTO NaverWorksAbsenceRecord (id, employeeId, sourceDocumentNo, sourceEmployeeName, sourceDepartment, absenceType, unitsMinutes, periodText, requestedOn, status, sourceRow, importedAt, updatedAt)\nSELECT UUID(), e.id, ${values.slice(0, 7).join(", ")}, 'IMPORTED', ${values[7]}, NOW(3), NOW(3)\nFROM Employee e WHERE e.name = ${values[8]} LIMIT 1\nON DUPLICATE KEY UPDATE sourceEmployeeName = VALUES(sourceEmployeeName), sourceDepartment = VALUES(sourceDepartment), absenceType = VALUES(absenceType), unitsMinutes = VALUES(unitsMinutes), periodText = VALUES(periodText), requestedOn = VALUES(requestedOn), sourceRow = VALUES(sourceRow), updatedAt = NOW(3);`;
});

writeFileSync(resolve(output), `${statements.join("\n\n")}\n`, "utf8");
console.log(`Generated ${rows.length} idempotent absence import statements.`);
