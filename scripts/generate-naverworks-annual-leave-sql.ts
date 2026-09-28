import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseNaverWorksAnnualLeaveWorkbook } from "../src/lib/naverworksAnnualLeave";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: tsx scripts/generate-naverworks-annual-leave-sql.ts <input.xlsx> <output.sql>");

const sourceAsOf = process.env.SOURCE_AS_OF ?? new Date().toISOString().slice(0, 10);
const sourceYear = Number(process.env.SOURCE_YEAR ?? sourceAsOf.slice(0, 4));
if (!Number.isInteger(sourceYear)) throw new Error("SOURCE_YEAR must be a year.");

const escapeSql = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "''");
const quote = (value: string) => `'${escapeSql(value)}'`;
const dateValue = (value: Date) => `'${value.toISOString().slice(0, 10)}'`;
const rows = parseNaverWorksAnnualLeaveWorkbook(readFileSync(resolve(input)));

const statements = rows.map((row) => {
  const login = quote(row.loginId);
  const name = quote(row.name);
  const values = [
    sourceYear,
    row.group ? quote(row.group) : "NULL",
    row.loginId ? login : "NULL",
    row.department ? quote(row.department) : "NULL",
    dateValue(row.cycleStart),
    dateValue(row.cycleEnd),
    row.annualGrantedMinutes,
    row.firstYearGrantedMinutes,
    row.firstYearCarryoverMinutes,
    row.carryoverMinutes,
    row.usedMinutes,
    row.adjustedMinutes,
    row.remainingMinutes,
    quote(sourceAsOf),
    row.rowNumber,
  ];

  return `INSERT INTO NaverWorksAnnualLeaveBalance (id, employeeId, sourceYear, sourceGroup, sourceLoginId, sourceDepartment, cycleStart, cycleEnd, annualGrantedMinutes, firstYearGrantedMinutes, firstYearCarryoverMinutes, carryoverMinutes, usedMinutes, adjustedMinutes, remainingMinutes, sourceAsOf, sourceRow, importedAt, updatedAt)\nSELECT UUID(), e.id, ${values.join(", ")}, NOW(3), NOW(3)\nFROM Employee e\nWHERE (e.externalLoginId = ${login} OR e.email = ${login})\n   OR (e.name = ${name} AND (SELECT COUNT(*) FROM Employee candidate WHERE candidate.name = ${name}) = 1)\nORDER BY CASE WHEN e.externalLoginId = ${login} OR e.email = ${login} THEN 0 ELSE 1 END\nLIMIT 1\nON DUPLICATE KEY UPDATE sourceGroup = VALUES(sourceGroup), sourceLoginId = VALUES(sourceLoginId), sourceDepartment = VALUES(sourceDepartment), cycleEnd = VALUES(cycleEnd), annualGrantedMinutes = VALUES(annualGrantedMinutes), firstYearGrantedMinutes = VALUES(firstYearGrantedMinutes), firstYearCarryoverMinutes = VALUES(firstYearCarryoverMinutes), carryoverMinutes = VALUES(carryoverMinutes), usedMinutes = VALUES(usedMinutes), adjustedMinutes = VALUES(adjustedMinutes), remainingMinutes = VALUES(remainingMinutes), sourceAsOf = VALUES(sourceAsOf), sourceRow = VALUES(sourceRow), updatedAt = NOW(3);`;
});

writeFileSync(resolve(output), `${statements.join("\n\n")}\n`, "utf8");
console.log(`Generated ${rows.length} idempotent annual leave balance import statements.`);
