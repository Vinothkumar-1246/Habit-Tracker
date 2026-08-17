package com.habitflow;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;

public class HabitFlowServer {
    private static final Gson GSON = new Gson();
    private static final SecureRandom RANDOM = new SecureRandom();
    private final String dbUrl;
    private final String dbUser;
    private final String dbPassword;
    private final Path staticRoot;

    public HabitFlowServer(String dbUrl, String dbUser, String dbPassword, Path staticRoot) {
        this.dbUrl = dbUrl;
        this.dbUser = dbUser;
        this.dbPassword = dbPassword;
        this.staticRoot = staticRoot;
    }

    public static void main(String[] args) throws Exception {
        Properties properties = loadProperties();
        String dbUrl = config("DB_URL", properties);
        String dbUser = config("DB_USER", properties);
        String dbPassword = config("DB_PASSWORD", properties);
        int port = Integer.parseInt(config("SERVER_PORT", properties));
        Path root = Path.of("..").toAbsolutePath().normalize();

        HabitFlowServer app = new HabitFlowServer(dbUrl, dbUser, dbPassword, root);
        try {
            app.initializeDatabase();
            System.out.println("MySQL connection ready.");
        } catch (SQLException ex) {
            System.out.println("HabitFlow will still open, but login/register need MySQL setup.");
            System.out.println("MySQL error: " + ex.getMessage());
            System.out.println("Run setup-mysql.bat or setup-database.sql, then restart this backend.");
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/register", app::register);
        server.createContext("/api/login", app::login);
        server.createContext("/api/habits", app::habits);
        server.createContext("/", app::staticFile);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("HabitFlow running at http://localhost:" + port);
    }

    private static Properties loadProperties() throws IOException {
        Properties properties = new Properties();
        try (InputStream input = HabitFlowServer.class.getClassLoader().getResourceAsStream("application.properties")) {
            if (input != null) {
                properties.load(input);
            }
        }
        return properties;
    }

    private static String config(String key, Properties properties) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) {
            value = properties.getProperty(key);
        }
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing config: " + key);
        }
        return value;
    }

    private Connection connection() throws SQLException {
        return DriverManager.getConnection(dbUrl, dbUser, dbPassword);
    }

    private void initializeDatabase() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS users (
                  id VARCHAR(64) PRIMARY KEY,
                  full_name VARCHAR(120) NOT NULL,
                  identifier VARCHAR(160) NOT NULL UNIQUE,
                  password_hash VARCHAR(255) NOT NULL,
                  password_salt VARCHAR(255) NOT NULL,
                  created_at DATE NOT NULL
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_data (
                  user_id VARCHAR(64) PRIMARY KEY,
                  habits_json LONGTEXT NOT NULL,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  CONSTRAINT fk_user_data_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """);
        }
    }

    private void register(HttpExchange exchange) throws IOException {
        if (!requireMethod(exchange, "POST")) return;
        try {
            JsonObject body = readJson(exchange);
            String name = clean(body, "name");
            String identifier = clean(body, "identifier").toLowerCase();
            String password = clean(body, "password");

            if (name.isBlank() || identifier.isBlank() || password.length() < 6) {
                sendJson(exchange, 400, error("Name, identifier, and a 6 character password are required."));
                return;
            }

            String id = "user_" + UUID.randomUUID();
            String salt = randomSalt();
            String hash = hashPassword(password, salt);

            try (Connection connection = connection()) {
                connection.setAutoCommit(false);
                try (PreparedStatement userStatement = connection.prepareStatement(
                    "INSERT INTO users (id, full_name, identifier, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
                     PreparedStatement dataStatement = connection.prepareStatement(
                         "INSERT INTO user_data (user_id, habits_json) VALUES (?, '[]')")) {
                    userStatement.setString(1, id);
                    userStatement.setString(2, name);
                    userStatement.setString(3, identifier);
                    userStatement.setString(4, hash);
                    userStatement.setString(5, salt);
                    userStatement.setString(6, LocalDate.now().toString());
                    userStatement.executeUpdate();
                    dataStatement.setString(1, id);
                    dataStatement.executeUpdate();
                    connection.commit();
                } catch (SQLException ex) {
                    connection.rollback();
                    if (ex.getMessage() != null && ex.getMessage().toLowerCase().contains("duplicate")) {
                        sendJson(exchange, 409, error("An account with that email or username already exists."));
                    } else {
                        throw ex;
                    }
                    return;
                }
            }

            sendJson(exchange, 201, Map.of("ok", true));
        } catch (Exception ex) {
            sendJson(exchange, 500, error("Registration failed: " + ex.getMessage()));
        }
    }

    private void login(HttpExchange exchange) throws IOException {
        if (!requireMethod(exchange, "POST")) return;
        try {
            JsonObject body = readJson(exchange);
            String identifier = clean(body, "identifier").toLowerCase();
            String password = clean(body, "password");

            try (Connection connection = connection();
                 PreparedStatement statement = connection.prepareStatement(
                     "SELECT id, full_name, identifier, password_hash, password_salt, created_at FROM users WHERE identifier = ?")) {
                statement.setString(1, identifier);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next() || !hashPassword(password, result.getString("password_salt")).equals(result.getString("password_hash"))) {
                        sendJson(exchange, 401, error("Incorrect email, username, or password."));
                        return;
                    }
                    Map<String, Object> user = new HashMap<>();
                    user.put("id", result.getString("id"));
                    user.put("name", result.getString("full_name"));
                    user.put("identifier", result.getString("identifier"));
                    user.put("createdAt", result.getString("created_at"));
                    sendJson(exchange, 200, Map.of("ok", true, "user", user));
                }
            }
        } catch (Exception ex) {
            sendJson(exchange, 500, error("Login failed: " + ex.getMessage()));
        }
    }

    private void habits(HttpExchange exchange) throws IOException {
        try {
            if ("GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                String userId = query(exchange).getOrDefault("userId", "");
                if (userId.isBlank()) {
                    sendJson(exchange, 400, error("Missing userId."));
                    return;
                }
                try (Connection connection = connection();
                     PreparedStatement statement = connection.prepareStatement("SELECT habits_json FROM user_data WHERE user_id = ?")) {
                    statement.setString(1, userId);
                    try (ResultSet result = statement.executeQuery()) {
                        String habits = result.next() ? result.getString("habits_json") : "[]";
                        sendRawJson(exchange, 200, "{\"ok\":true,\"habits\":" + habits + "}");
                    }
                }
                return;
            }

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                JsonObject body = readJson(exchange);
                String userId = clean(body, "userId");
                String habitsJson = body.has("habits") ? GSON.toJson(body.get("habits")) : "[]";
                if (userId.isBlank()) {
                    sendJson(exchange, 400, error("Missing userId."));
                    return;
                }
                try (Connection connection = connection();
                     PreparedStatement statement = connection.prepareStatement(
                         "INSERT INTO user_data (user_id, habits_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE habits_json = VALUES(habits_json)")) {
                    statement.setString(1, userId);
                    statement.setString(2, habitsJson);
                    statement.executeUpdate();
                }
                sendJson(exchange, 200, Map.of("ok", true));
                return;
            }

            requireMethod(exchange, "GET");
        } catch (Exception ex) {
            sendJson(exchange, 500, error("Habit sync failed: " + ex.getMessage()));
        }
    }

    private void staticFile(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendCors(exchange);
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        String rawPath = exchange.getRequestURI().getPath();
        String requested = rawPath.equals("/") ? "/index.html" : rawPath;
        Path file = staticRoot.resolve(requested.substring(1)).normalize();

        if (!file.startsWith(staticRoot) || !Files.exists(file) || Files.isDirectory(file)) {
            sendJson(exchange, 404, error("File not found."));
            return;
        }

        byte[] bytes = Files.readAllBytes(file);
        Headers headers = exchange.getResponseHeaders();
        sendCors(exchange);
        headers.set("Content-Type", contentType(file));
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static JsonObject readJson(HttpExchange exchange) throws IOException {
        try (InputStream input = exchange.getRequestBody()) {
            String text = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            return JsonParser.parseString(text.isBlank() ? "{}" : text).getAsJsonObject();
        }
    }

    private static String clean(JsonObject object, String key) {
        return object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsString().trim() : "";
    }

    private static Map<String, Object> error(String message) {
        return Map.of("ok", false, "message", message);
    }

    private static boolean requireMethod(HttpExchange exchange, String method) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendCors(exchange);
            exchange.sendResponseHeaders(204, -1);
            return false;
        }
        if (!method.equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, error("Method not allowed."));
            return false;
        }
        return true;
    }

    private static void sendJson(HttpExchange exchange, int status, Object payload) throws IOException {
        sendRawJson(exchange, status, GSON.toJson(payload));
    }

    private static void sendRawJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        sendCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static void sendCors(HttpExchange exchange) {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Headers", "Content-Type");
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }

    private static Map<String, String> query(HttpExchange exchange) {
        Map<String, String> values = new HashMap<>();
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null || query.isBlank()) return values;
        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            String value = parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
            values.put(key, value);
        }
        return values;
    }

    private static String randomSalt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static String hashPassword(String password, String salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), Base64.getDecoder().decode(salt), 120_000, 256);
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        return Base64.getEncoder().encodeToString(factory.generateSecret(spec).getEncoded());
    }

    private static String contentType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }
}
