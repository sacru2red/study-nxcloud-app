#!/bin/bash
set -e

NC_URL="${NEXTCLOUD_URL:-http://localhost:8080}"
NC_USER="${NEXTCLOUD_ADMIN_USER:-admin}"
NC_PASS="${NEXTCLOUD_ADMIN_PASS:-admin123}"

echo "Waiting for Nextcloud to be ready..."
until curl -s -o /dev/null -w "%{http_code}" "$NC_URL/status.php" | grep -q "200"; do
  echo "  Nextcloud not ready, waiting 10s..."
  sleep 10
done
echo "Nextcloud is ready!"

AUTH="$NC_USER:$NC_PASS"
OCS_HEADERS="-H OCS-APIRequest:true -H Content-Type:application/x-www-form-urlencoded"

create_group() {
  local gid="$1"
  echo "Creating group: $gid"
  curl -s -X POST "$NC_URL/ocs/v2.php/cloud/groups" -u "$AUTH" $OCS_HEADERS -d "groupid=$gid" || true
}

create_user() {
  local uid="$1"
  local pwd="$2"
  local email="$3"
  echo "Creating user: $uid"
  curl -s -X POST "$NC_URL/ocs/v2.php/cloud/users" -u "$AUTH" $OCS_HEADERS \
    -d "userid=$uid" -d "password=$pwd" -d "email=$email" || true
}

add_user_to_group() {
  local uid="$1"
  local gid="$2"
  echo "Adding $uid to group $gid"
  curl -s -X POST "$NC_URL/ocs/v2.php/cloud/users/$uid/groups" -u "$AUTH" $OCS_HEADERS \
    -d "groupid=$gid" || true
}

set_quota() {
  local uid="$1"
  local quota="$2"
  echo "Setting quota for $uid to $quota"
  curl -s -X PUT "$NC_URL/ocs/v2.php/cloud/users/$uid" -u "$AUTH" $OCS_HEADERS \
    -d "key=quota" -d "value=$quota" || true
}

create_group "tenant-a"
create_group "tenant-b"

create_user "user-a1" "password123" "user-a1@datco.kr"
create_user "user-a2" "password123" "user-a2@datco.kr"
create_user "user-a3" "password123" "user-a3@datco.kr"
create_user "user-b1" "password123" "user-b1@datco.kr"
create_user "user-b2" "password123" "user-b2@datco.kr"
create_user "user-b3" "password123" "user-b3@datco.kr"

add_user_to_group "user-a1" "tenant-a"
add_user_to_group "user-a2" "tenant-a"
add_user_to_group "user-a3" "tenant-a"
add_user_to_group "user-b1" "tenant-b"
add_user_to_group "user-b2" "tenant-b"
add_user_to_group "user-b3" "tenant-b"

set_quota "user-a1" "100 MB"
set_quota "user-a2" "100 MB"
set_quota "user-a3" "100 MB"
set_quota "user-b1" "100 MB"
set_quota "user-b2" "100 MB"
set_quota "user-b3" "100 MB"

echo "Nextcloud initialization complete!"
