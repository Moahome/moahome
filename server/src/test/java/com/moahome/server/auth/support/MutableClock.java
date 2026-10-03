package com.moahome.server.auth.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

public final class MutableClock extends Clock {
	private Instant current;

	public MutableClock(Instant current) {
		this.current = current;
	}

	public void set(Instant current) {
		this.current = current;
	}

	public void advance(Duration duration) {
		current = current.plus(duration);
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return Clock.fixed(current, zone);
	}

	@Override
	public Instant instant() {
		return current;
	}
}
