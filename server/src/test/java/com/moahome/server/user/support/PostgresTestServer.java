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

	private final Path data;

	private final String controlExecutable;

	public PostgresTestServer() {
		try {
			try (ServerSocket socket = new ServerSocket(0)) {
				port = socket.getLocalPort();
			}
			Path directory = Files.createTempDirectory("moahome-user-postgres-");
			data = directory.resolve("data");
			String initdb = System.getenv().getOrDefault("POSTGRES_INITDB_EXECUTABLE", "initdb");
			Process initialize = new ProcessBuilder(initdb, "-D", data.toString(), "-A", "trust", "-U", username(),
			    "--no-locale", "-E", "UTF8").redirectErrorStream(true)
			    .redirectOutput(directory.resolve("initdb.log").toFile()).start();
			if (!initialize.waitFor(20, TimeUnit.SECONDS)) {
				initialize.destroyForcibly();
				throw new IllegalStateException("Test PostgreSQL initialization timed out");
			}
			if (initialize.exitValue() != 0) {
				throw new IllegalStateException(
				    "Test PostgreSQL initialization failed; check " + directory.resolve("initdb.log"));
			}
			String executable = System.getenv().getOrDefault("POSTGRES_SERVER_EXECUTABLE", "postgres");
			controlExecutable = Path.of(executable).resolveSibling("pg_ctl").toString();
			process = new ProcessBuilder(executable, "-D", data.toString(), "-h", "127.0.0.1", "-p",
			    Integer.toString(port), "-k", "", "-c", "fsync=off").redirectErrorStream(true)
			    .redirectOutput(directory.resolve("postgres.log").toFile()).start();
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
			throw new IllegalStateException(
			    "Isolated test PostgreSQL did not start; check " + directory.resolve("postgres.log"));
		} catch (IOException | InterruptedException exception) {
			if (exception instanceof InterruptedException) {
				Thread.currentThread().interrupt();
			}
			throw new IllegalStateException(
			    "Tests require initdb/postgres or POSTGRES_INITDB_EXECUTABLE/POSTGRES_SERVER_EXECUTABLE", exception);
		}
	}

	public String jdbcUrl() {
		return "jdbc:postgresql://127.0.0.1:" + port + "/postgres";
	}

	public String username() {
		return "moahome_test";
	}

	/** 연결 풀이 열려 있어도 테스트 DB만 빠르게 종료해 강제 종료로 공유 메모리가 남지 않게 합니다. */
	@Override
	public synchronized void close() {
		if (!process.isAlive())
			return;
		try {
			// SIGTERM의 smart 종료는 열린 JDBC 연결을 기다리므로 테스트 전용 경로에 fast 종료를 요청합니다.
			var stop = new ProcessBuilder(controlExecutable, "-D", data.toString(), "-m", "fast", "-w", "-t", "3",
			    "stop").redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
			if (!stop.waitFor(5, TimeUnit.SECONDS))
				stop.destroyForcibly();
			if (!process.isAlive())
				return;
		} catch (IOException exception) {
			// 종료 도구를 실행할 수 없는 환경에서도 기존 프로세스 정리 경로를 유지합니다.
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			process.destroyForcibly();
			return;
		}
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
