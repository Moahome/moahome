-- 초안 파일도 소유자·관리대상에 귀속하며 게시 성공 시 공지와 같은 트랜잭션에서 연결합니다.
create table notice_assets (
 id uuid primary key,
 property_id uuid not null references properties(id),
 uploaded_by uuid not null references users(id),
 notice_id uuid references notices(id),
 object_key varchar(300) not null unique,
 file_name varchar(255) not null,
 content_type varchar(100) not null,
 byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
 sha256 varchar(64) not null,
 image boolean not null,
 created_at timestamptz not null default now()
);
create index notice_assets_notice_idx on notice_assets(notice_id);
create index notice_assets_owner_idx on notice_assets(property_id, uploaded_by);
