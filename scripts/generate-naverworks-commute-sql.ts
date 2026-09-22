import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseNaverWorksCommuteWorkbook } from "../src/lib/naverworksCommute";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: tsx scripts/generate-naverworks-commute-sql.ts <input.xlsx> <output.sql>");

const escapeSql = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "''");
const sqlString = (value: string | null | undefined) => value ? `'${escapeSql(value)}'` : "NULL";
const sqlDateTime = (value: Date | null) => value ? `'${value.toISOString().slice(0, 19).replace("T", " ")}'` : "NULL";
const sqlDate = (value: Date) => `'${value.toISOString().slice(0, 10)}'`;
const rows = parseNaverWorksCommuteWorkbook(readFileSync(resolve(input)));

const statements = rows.map((row) => {
  const login = sqlString(row.loginId);
  const name = sqlString(row.name);
  const loginMatch = row.loginId
    ? `LOWER(COALESCE(e.externalLoginId, '')) = LOWER(${login})`
    : "FALSE";
  const sourceLogin = row.loginId
    ? `COALESCE(${login}, e.externalLoginId, ${name})`
    : `COALESCE(e.externalLoginId, ${name})`;
  const values = [
    sqlDate(row.baseDate), sqlString(row.workStyle), sqlString(row.workType), sqlString(row.schedule),
    sqlDateTime(row.checkInAt), sqlDateTime(row.checkOutAt), sqlString(row.checkInRaw), sqlString(row.checkOutRaw),
    sqlString(row.workLocation), String(row.breakMinutes), String(row.offsiteMinutes), String(row.absenceMinutes),
    row.late ? "1" : "0", row.earlyLeave ? "1" : "0", sqlString(row.requiredWorkCompliant),
    sqlString(row.scheduleCompliant), sqlString(row.scheduleVariance), String(row.rowNumber),
  ];
  return `INSERT INTO NaverWorksDailyRecord (id, employeeId, baseDate, workStyle, workType, schedule, checkInAt, checkOutAt, checkInRaw, checkOutRaw, workLocation, breakMinutes, offsiteMinutes, absenceMinutes, late, earlyLeave, requiredWorkCompliant, scheduleCompliant, scheduleVariance, sourceLoginId, sourceRow, importedAt, updatedAt)\nSELECT UUID(), e.id, ${values.slice(0, 17).join(", ")}, ${sourceLogin}, ${values[17]}, NOW(3), NOW(3)\nFROM Employee e\nWHERE ${loginMatch}\n   OR (e.name = ${name} AND (SELECT COUNT(*) FROM Employee candidate WHERE candidate.name = ${name}) = 1)\nORDER BY CASE WHEN ${loginMatch} THEN 0 ELSE 1 END\nLIMIT 1\nON DUPLICATE KEY UPDATE workStyle = VALUES(workStyle), workType = VALUES(workType), schedule = VALUES(schedule), checkInAt = VALUES(checkInAt), checkOutAt = VALUES(checkOutAt), checkInRaw = VALUES(checkInRaw), checkOutRaw = VALUES(checkOutRaw), workLocation = VALUES(workLocation), breakMinutes = VALUES(breakMinutes), offsiteMinutes = VALUES(offsiteMinutes), absenceMinutes = VALUES(absenceMinutes), late = VALUES(late), earlyLeave = VALUES(earlyLeave), requiredWorkCompliant = VALUES(requiredWorkCompliant), scheduleCompliant = VALUES(scheduleCompliant), scheduleVariance = VALUES(scheduleVariance), sourceLoginId = VALUES(sourceLoginId), sourceRow = VALUES(sourceRow), updatedAt = NOW(3);`;
});

writeFileSync(resolve(output), `${statements.join("\n\n")}\n`, "utf8");
console.log(`Generated ${rows.length} idempotent commute import statements.`);
