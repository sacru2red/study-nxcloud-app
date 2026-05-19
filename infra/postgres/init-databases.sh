#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	SELECT 'CREATE DATABASE nxcloud_app'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nxcloud_app')\gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "nxcloud_app" <<-EOSQL
	CREATE EXTENSION IF NOT EXISTS vector;
EOSQL
