import assert from "node:assert/strict";
import test from "node:test";
import { mariaDbConfigFromUrl } from "./mariaDbConfig";

test("parses an encoded MariaDB connection URL", () => {
  assert.deepEqual(
    mariaDbConfigFromUrl(
      "mysql://hr_user:p%40ssword@hr-mariadb:3307/bnow_hr",
    ),
    {
      host: "hr-mariadb",
      port: 3307,
      user: "hr_user",
      password: "p@ssword",
      database: "bnow_hr",
      connectionLimit: 10,
      timezone: "Z",
    },
  );
});

test("rejects missing and non-MariaDB URLs", () => {
  assert.throws(() => mariaDbConfigFromUrl(undefined), /required/);
  assert.throws(
    () => mariaDbConfigFromUrl("postgresql://user:pass@db/hr"),
    /mysql protocol/,
  );
  assert.throws(
    () => mariaDbConfigFromUrl("mysql://user@db/hr"),
    /missing MariaDB connection details/,
  );
});
