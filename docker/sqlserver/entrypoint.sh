#!/bin/bash
# Start SQL Server in the background
/opt/mssql/bin/sqlservr &
SQLPID=$!

# Wait for SQL Server to accept connections (up to 60s)
echo "[init] Waiting for SQL Server to start..."
for i in $(seq 1 30); do
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P "$MSSQL_SA_PASSWORD" -No -Q "SELECT 1" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "[init] SQL Server is ready."
    break
  fi
  echo "[init] Not ready yet ($i/30), retrying in 2s..."
  sleep 2
done

# Restore AdventureWorks if the database doesn't already exist
BAK="/var/opt/mssql/backup/AdventureWorks2022.bak"
if [ -f "$BAK" ]; then
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P "$MSSQL_SA_PASSWORD" -No -Q "
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'AdventureWorks2022')
    BEGIN
      PRINT 'Restoring AdventureWorks2022...'
      RESTORE DATABASE AdventureWorks2022
        FROM DISK = N'/var/opt/mssql/backup/AdventureWorks2022.bak'
        WITH MOVE 'AdventureWorks2022'     TO '/var/opt/mssql/data/AdventureWorks2022.mdf',
             MOVE 'AdventureWorks2022_log' TO '/var/opt/mssql/data/AdventureWorks2022_log.ldf',
             NOUNLOAD, STATS = 10
      PRINT 'Restore complete.'
    END
    ELSE
      PRINT 'AdventureWorks2022 already exists, skipping restore.'
  "
else
  echo "[init] WARNING: $BAK not found — skipping AdventureWorks restore."
  echo "[init] Download it from the Microsoft SQL Server samples GitHub releases"
  echo "[init] and place it in ./backup/AdventureWorks2022.bak"
fi

# Hand control back to SQL Server
wait $SQLPID
