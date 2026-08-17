# HabitFlow Java + MySQL Backend

This backend fixes the cross-browser login issue by storing accounts and habits in MySQL instead of one browser's LocalStorage.

## MySQL

The app uses these defaults in `src/main/resources/application.properties`:

```text
DB_URL=jdbc:mysql://localhost:3306/habitflow?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USER=VINOTH
DB_PASSWORD=vinothkumar123
SERVER_PORT=8081
```

The server creates the `habitflow` database tables automatically when it starts.

If MySQL says `Access denied for user 'VINOTH'@'localhost'` or `Access denied for user 'VINOTH'@'%'`, run `setup-mysql.bat` and enter your MySQL root/admin password. You can also open MySQL Workbench as an admin/root user and run `setup-database.sql`. Both options create/fix the `VINOTH` user, grant access to the `habitflow` database, and create the tables.

## Run

From this `backend` folder:

```bash
mvn package
java -jar target/habitflow-backend-1.0.0.jar
```

Or double-click:

```text
run-backend.bat
```

Then open:

```text
http://localhost:8081
```

Register or log in there. Another Chrome/browser can use the same account because both browsers talk to the same MySQL database.
