type MariaDbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  timezone: "Z";
};

export function mariaDbConfigFromUrl(value: string | undefined): MariaDbConfig {
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid MariaDB connection URL.");
  }

  if (parsed.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql protocol for MariaDB.");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const port = parsed.port ? Number(parsed.port) : 3306;
  if (
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    !database ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("DATABASE_URL is missing MariaDB connection details.");
  }

  return {
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: 10,
    timezone: "Z",
  };
}
