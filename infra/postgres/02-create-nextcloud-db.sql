-- Nextcloud 전용 DB (앱 DB nxcloud_app 과 분리). docker-entrypoint-initdb.d 에서 psql 로 실행.
CREATE DATABASE nextcloud;
GRANT ALL PRIVILEGES ON DATABASE nextcloud TO nxcloud;

-- Nextcloud 30+ installer creates a dedicated DB user at runtime.
-- Grant schema-level privileges so that dynamically created user can create and access tables.
\c nextcloud
GRANT ALL ON SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
