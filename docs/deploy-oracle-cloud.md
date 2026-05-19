# Oracle Cloud 무료 VM — 모놀리식 배포

한 대의 **OCI Always Free ARM VM**에서 Postgres(pgvector) · Nextcloud · NestJS 백엔드 · React 프론트(nginx)를 **Docker Compose**로 실행합니다.

브랜치: `feat/oci-monolith-deploy` (워크트리 예: `../study-nxcloud-app-oci`)

## 아키텍처

```
인터넷 :80
    │
    ▼
┌─────────┐     /api/*     ┌──────────┐
│  nginx  │ ─────────────► │ backend  │
│  (web)  │                │  :3000   │
│  SPA    │                └────┬─────┘
└─────────┘                     │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              postgres    nextcloud    (Gemini/LLM API)
              pgvector    WebDAV
```

- 외부에 노출되는 포트: **80** (필요 시 `HTTP_PORT` 변경)
- Postgres·Nextcloud는 Docker 내부 네트워크만 사용

## 1. OCI VM 만들기

1. [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) 가입
2. **Compute → Instances → Create instance**
   - **Shape**: Ampere A1.Flex (Always Free) — OCPU 2~4, RAM 12~24GB 권장
   - **Image**: Ubuntu 22.04 또는 24.04 (aarch64)
   - **Networking**: Public subnet, **Public IPv4** 할당
3. **Security List / NSG** 인바운드
   - `22` (SSH)
   - `80` (HTTP, 시연용)
   - (선택) `443` — 이후 Caddy/Let's Encrypt용

## 2. VM 초기 설정

SSH 접속 후:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# 로그아웃 후 재접속

docker compose version
```

## 3. 코드 배포

```bash
git clone https://github.com/sacru2red/study-nxcloud-app.git
cd study-nxcloud-app
git checkout feat/oci-monolith-deploy

cp infra/.env.prod.example .env
nano .env   # 비밀번호, API 키, CORS_ORIGIN 수정
```

### `.env` 필수 항목

| 변수                       | 설명                                                   |
| -------------------------- | ------------------------------------------------------ |
| `POSTGRES_PASSWORD`        | DB 비밀번호                                            |
| `NEXTCLOUD_ADMIN_PASSWORD` | Nextcloud 관리자                                       |
| `JWT_SECRET`               | 임의의 긴 문자열                                       |
| `GEMINI_API_KEY`           | [Google AI Studio](https://aistudio.google.com/apikey) |
| `LLM_API_KEY`              | [opencode.ai](https://opencode.ai/auth)                |
| `CORS_ORIGIN`              | 브라우저 접속 URL (`http://<공인IP>`)                  |

첫 기동 후 시드가 완료되면 `RUN_SEED=false`로 바꾸고 `docker compose ... up -d`로 재시작하는 것을 권장합니다.

## 4. 기동

```bash
chmod +x infra/deploy/up.sh infra/postgres/init-databases.sh
./infra/deploy/up.sh
```

또는:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --build
```

첫 빌드는 10~20분 걸릴 수 있습니다(ARM에서 npm ci + nx build).

### 상태 확인

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
docker compose --env-file .env -f infra/docker-compose.prod.yml logs -f backend
```

브라우저: `http://<공인IP>/` → 로그인 ([development.md](./development.md) 테스트 계정)

## 5. 로컬에서 워크트리로 작업

메인 작업 트리에 미커밋 변경이 있을 때:

```bash
cd /path/to/study-nxcloud-app
git worktree add ../study-nxcloud-app-oci -b feat/oci-monolith-deploy origin/main
cd ../study-nxcloud-app-oci
# 배포 관련 수정 후 커밋·푸시
```

## 6. HTTPS (선택)

시연만이면 HTTP로 충분합니다. HTTPS가 필요하면 VM에 **Caddy** 또는 **nginx + certbot**을 호스트에 두고 `web` 서비스는 `127.0.0.1:8080`에만 바인딩하는 방식을 권장합니다.

## 7. 리소스·문제 해결

| 증상                  | 조치                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 빌드 OOM              | 스왑 추가: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| Nextcloud 초기화 느림 | `logs -f nextcloud` — 5~10분 대기                                                                                         |
| 502 / API 실패        | `backend` 로그, `DATABASE_URL`·Nextcloud URL 확인                                                                         |
| CORS 오류             | `.env`의 `CORS_ORIGIN`이 브라우저 주소와 **완전 일치**하는지 확인 (포트 포함)                                             |
| 디스크 부족           | `docker system prune -a` (주의: 미사용 이미지 삭제)                                                                       |

## 8. 중지·삭제

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml down
# 볼륨까지 삭제 (DB·Nextcloud 데이터 초기화)
docker compose --env-file .env -f infra/docker-compose.prod.yml down -v
```

## 관련 문서

- [development.md](./development.md) — 로컬 개발·테스트 계정
- [infra/docker-compose.yml](../infra/docker-compose.yml) — 로컬 인프라만 (Postgres + Nextcloud)
