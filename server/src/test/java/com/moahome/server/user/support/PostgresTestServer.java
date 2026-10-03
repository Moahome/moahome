package com.moahome.server.user.support;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

public final class PostgresTestServer implements AutoCloseable {
	private final Process process;
	private final int port;

	public PostgresTestServer() {
		try {
			try (ServerSocket socket = new ServerSocket(0)) {
				port = socket.getLocalPort();
			}
			Path directory = Files.createTempDirectory("moahome-user-postgres-");
			Path data = directory.resolve("data");
			String initdb = System.getenv().getOrDefault("POSTGRES_INITDB_EXECUTABLE", "initdb");
			Process initialize = new ProcessBuilder(initdb, "-D", data.toString(), "-A", "trust", "-U", username(),
				"--no-locale", "-E", "UTF8")
				.redirectErrorStream(true).redirectOutput(directory.resolve("initdb.log").toFile()).start();
			if (!initialize.waitFor(20, TimeUnit.SECONDS)) {
				initialize.destroyForcibly();
				throw new IllegalStateException("Test PostgreSQL initialization timed out");
			}
			if (initialize.exitValue() != 0) {
				throw new IllegalStateException("Test PostgreSQL initialization failed; check " + directory.resolve("initdb.log"));
			}
			String executable = System.getenv().getOrDefault("POSTGRES_SERVER_EXECUTABLE", "postgres");
			process = new ProcessBuilder(executable, "-D", data.toString(), "-h", "127.0.0.1", "-p", Integer.toString(port),
				"-k", "", "-c", "fsync=off")
				.redirectErrorStream(true).redirectOutput(directory.resolve("postgres.log").toFile()).start();
			Runtime.getRuntime().addShutdownHook(new Thread(this::close));
			long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
			while (System.nanoTime() < deadline && process.isAlive()) {
				try (var connection = DriverManager.getConnection(jdbcUrl(), username(), "")) {
					return;
				} catch (SQLException exception) {
					Thread.sleep(25);
				}
			}
			close();
			throw new IllegalStateException("Isolated test PostgreSQL did not start; check " + directory.resolve("postgres.log"));
		} catch (IOException | InterruptedException exception) {
			if (exception instanceof InterruptedException) {
				Thread.currentThread().interrupt();
			}
			throw new IllegalStateException("Tests require initdb/postgres or POSTGRES_INITDB_EXECUTABLE/POSTGRES_SERVER_EXECUTABLE", exception);
		}
	}

	public String jdbcUrl() {
		return "jdbc:postgresql://127.0.0.1:" + port + "/postgres";
	}

	public String username() {
		return "moahome_test";
	}

	@Override
	public void close() {
		process.destroy();
		try {
			if (!process.waitFor(3, TimeUnit.SECONDS)) {
				process.destroyForcibly();
			}
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			process.destroyForcibly();
		}
	}
}
