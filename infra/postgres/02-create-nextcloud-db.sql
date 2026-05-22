-- Nextcloud 전용 DB (앱 DB nxcloud_app 과 분리). docker-entrypoint-initdb.d 에서 psql 로 실행.
CREATE DATABASE nextcloud;
GRANT ALL PRIVILEGES ON DATABASE nextcloud TO nxcloud;
