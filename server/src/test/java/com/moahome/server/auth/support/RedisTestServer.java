package com.moahome.server.auth.support;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

public final class RedisTestServer implements AutoCloseable {
	private final Process process;
	private final int port;

	public RedisTestServer() {
		try {
			try (ServerSocket socket = new ServerSocket(0)) {
				port = socket.getLocalPort();
			}
			Path directory = Files.createTempDirectory("moahome-security-redis-");
			String executable = System.getenv().getOrDefault("REDIS_SERVER_EXECUTABLE", "redis-server");
			process = new ProcessBuilder(executable, "--bind", "127.0.0.1", "--port", Integer.toString(port),
				"--save", "", "--appendonly", "no", "--dir", directory.toString())
				.redirectErrorStream(true).redirectOutput(directory.resolve("redis.log").toFile()).start();
			Runtime.getRuntime().addShutdownHook(new Thread(this::close));
			long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
			while (System.nanoTime() < deadline && process.isAlive()) {
				try (Socket socket = new Socket()) {
					socket.connect(new InetSocketAddress("127.0.0.1", port), 100);
					return;
				} catch (IOException exception) {
					Thread.sleep(20);
				}
			}
			close();
			throw new IllegalStateException("Isolated test Redis did not start; check " + directory.resolve("redis.log"));
		} catch (IOException | InterruptedException exception) {
			if (exception instanceof InterruptedException) {
				Thread.currentThread().interrupt();
			}
			throw new IllegalStateException("Tests require redis-server or REDIS_SERVER_EXECUTABLE", exception);
		}
	}

	public int port() {
		return port;
	}

	@Override
	public void close() {
		process.destroy();
		try {
			if (!process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) {
				process.destroyForcibly();
			}
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			process.destroyForcibly();
		}
	}
}
