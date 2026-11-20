package com.moahome.server.common.storage;

/** SDK 응답과 객체 키를 노출하지 않는 저장소 오류입니다. HTTP 응답은 각 기능에서 결정합니다. */
public class StorageException extends RuntimeException {

	public enum Reason {
		NOT_FOUND, UNAVAILABLE
	}

	private final Reason reason;

	public StorageException(Reason reason) {
		super(reason.name());
		this.reason = reason;
	}

	public Reason reason() {
		return reason;
	}
}
