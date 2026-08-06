$ErrorActionPreference = 'Stop'

$connectionString = 'Server=db.livecareworld.com;Database=LIVECARE;User ID=livecare;Password=!livecare!;TrustServerCertificate=True;'
$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
$connection.Open()

function Invoke-Scalar {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Query
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $Query
    return $command.ExecuteScalar()
}

function Invoke-Row {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Query
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $Query
    $reader = $command.ExecuteReader()

    try {
        if (-not $reader.Read()) {
            return $null
        }

        $row = [ordered]@{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $value = $reader.GetValue($i)
            if ($value -is [System.DBNull]) {
                $value = $null
            }
            $row[$reader.GetName($i)] = $value
        }
        return [pscustomobject]$row
    }
    finally {
        $reader.Close()
    }
}

$result = [ordered]@{
    employees = Invoke-Scalar -Connection $connection -Query 'SELECT COUNT(*) FROM dbo.CHECKINOUT_EMPLOYEE;'
    attendance_records = Invoke-Scalar -Connection $connection -Query 'SELECT COUNT(*) FROM dbo.CHECKINOUT_ATTENDANCE_RECORD;'
    annual_leave_balances = Invoke-Scalar -Connection $connection -Query 'SELECT COUNT(*) FROM dbo.CHECKINOUT_ANNUAL_LEAVE_BALANCE;'
    resignation = Invoke-Row -Connection $connection -Query @"
SELECT TOP (1)
    EMPLOYEE_CODE,
    EMPLOYEE_NAME,
    LOGIN_ID,
    IS_ACTIVE,
    CONVERT(varchar(10), RESIGNED_ON, 23) AS RESIGNED_ON
FROM dbo.CHECKINOUT_EMPLOYEE
WHERE LOGIN_ID = 'su.lee@bnow.co.kr';
"@
    attendance_window = Invoke-Row -Connection $connection -Query @"
SELECT
    CONVERT(varchar(19), MIN(ar.RECORDED_AT), 120) AS FIRST_RECORDED_AT,
    CONVERT(varchar(19), MAX(ar.RECORDED_AT), 120) AS LAST_RECORDED_AT,
    COUNT(*) AS RECORD_COUNT
FROM dbo.CHECKINOUT_ATTENDANCE_RECORD ar
INNER JOIN dbo.CHECKINOUT_EMPLOYEE e
    ON e.CHECKINOUT_EMPLOYEE_ID = ar.CHECKINOUT_EMPLOYEE_ID
WHERE e.LOGIN_ID = 'su.lee@bnow.co.kr';
"@
}

$connection.Close()
$result | ConvertTo-Json -Depth 4
