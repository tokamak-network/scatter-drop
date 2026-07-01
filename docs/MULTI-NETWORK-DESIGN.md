# 멀티네트워크 지원 — 백엔드 & DB 설계

플랫폼 관리자가 **지원 네트워크를 등록**하고, 운영자가 캠페인 생성 시 그 중 하나를
**에어드랍 네트워크로 선택**한다. DropFactory는 체인별 배포이므로 컨트랙트 변경은 없고,
"어떤 체인에 어떤 팩토리/레지스트리가 있는지"를 **앱 백엔드(DB)** 가 관리한다.

## 1. 데이터 모델 (DB)

현재 앱은 DB가 없다(인메모리 store만). 관리자 설정은 영속·공유가 필요하므로 **실 DB** 도입.

### 테이블: `networks`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `chain_id` | INTEGER PK | EIP-155 체인 ID (유니크) |
| `name` | TEXT | 표시 이름 (예: "Sepolia", "Optimism") |
| `rpc_url` | TEXT | **서버측** 스캔용 RPC (키 포함 가능 → 브라우저 미노출) |
| `public_rpc_url` | TEXT NULL | 브라우저(wagmi)용 공개 RPC (없으면 서버 프록시) |
| `explorer_url` | TEXT NULL | 블록 익스플로러 베이스 |
| `native_symbol` | TEXT | 기본 "ETH" |
| `drop_factory` | TEXT | DropFactory 주소 (필수) |
| `fee_token` | TEXT NULL | 기본 수수료 토큰 |
| `treasury` | TEXT NULL | 트레저리 |
| `operator_registry` | TEXT NULL | 운영자 신원 레지스트리 |
| `zk_factory` | TEXT NULL | zk RegistryFactory |
| `deploy_block` | INTEGER NULL | 팩토리 배포 블록(로그 스캔 시작점) |
| `enabled` | BOOLEAN | 운영자에게 노출 여부 |
| `created_at` / `updated_at` | TIMESTAMP | |

### 테이블: `platform_admins`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `address` | TEXT PK | 네트워크 레지스트리를 관리할 수 있는 지갑(앱 레벨 플랫폼 어드민) |

> 온체인 어드민(`DropFactory.owner()`)은 **체인별**이라 "네트워크를 추가하는 주체"는
> 앱 레벨로 별도 정의해야 함. `platform_admins` 허용목록으로 관리.

## 2. 인증 (관리자 API)

- **SIWE-lite**: 관리자가 지갑으로 nonce에 서명 → 서버가 주소 검증 + `platform_admins` 멤버십 확인 → 세션 쿠키(HttpOnly) 발급. 이후 `/api/admin/*`는 세션 검사.
- 대안(MVP): 서버 환경변수 `PLATFORM_ADMIN_SECRET` (Bearer) — 단순하나 지갑기반 아님.
- 읽기(`GET /api/networks`)는 공개(민감정보 제외).

## 3. API 설계

| 메서드 · 경로 | 권한 | 설명 |
|---|---|---|
| `GET /api/networks` | 공개 | **enabled** 네트워크의 안전 필드(chainId·name·public_rpc·explorer·native·컨트랙주소들). `rpc_url`(서버키) 제외 |
| `POST /api/admin/networks` | 어드민 | 네트워크 추가(위 필드 입력·검증: 주소형식·chainId 유니크·drop_factory 필수) |
| `PATCH /api/admin/networks/:chainId` | 어드민 | 수정/enable·disable |
| `DELETE /api/admin/networks/:chainId` | 어드민 | 삭제(캠페인 있으면 disable 권장) |
| `GET /api/admin/networks` | 어드민 | 전체(비활성 포함) + rpc_url |

서버 스캔(snapshot/campaigns)은 `chain_id`로 `networks.rpc_url`을 조회해 사용(기존 단일 env 대체).

## 4. 클라이언트 통합

- **wagmi**: 현재 단일 `fork` → `GET /api/networks`로 받은 목록으로 **동적 다중 체인** config 구성(각 chainId + public_rpc transport). 지갑 체인 스위칭 지원.
- **배포 해석**: 현재 `deployment.ts`(env 단일) → 선택된 chainId의 network 레코드에서 dropFactory 등 해석.
- **캠페인 생성 마법사**: 1단계에 **네트워크 선택** 드롭다운(enabled 목록). 선택 chainId의 팩토리로 createDrop. 지갑이 다른 체인이면 스위치 유도.
- **캠페인 조회/상세**: 캠페인은 소속 chainId를 가짐 → 해당 네트워크로 읽기. Explore는 선택 네트워크(또는 전체) 기준.
- **어드민 화면**: 신규 **"Networks" 탭** — 목록 + 추가 폼(chainId·name·RPC·컨트랙 주소들) + enable/disable.

## 5. 영속성 선택 (구현 기술)

| 옵션 | 장점 | 단점 | 권장 |
|---|---|---|---|
| **SQLite (Prisma)** | 제로 인프라(파일), 마이그레이션·타입 | 단일 인스턴스 | ✅ MVP/자체호스팅 |
| **Postgres (Prisma)** | 프로덕션·다중 인스턴스 | 인프라 필요 | 프로덕션 전환 |
| JSON 파일 | 초간단 | 동시성·스키마 없음 | 비권장 |

→ **Prisma + SQLite로 시작**(스키마·마이그레이션·타입 안전), 프로덕션은 DATABASE_URL만 Postgres로 교체. 기존 인메모리 proofs/snapshot store도 추후 같은 DB로 통합 가능.

## 6. 마이그레이션 & 시드

- 현재 단일 배포(NEXT_PUBLIC_* / deployment.json)를 **네트워크 1개 row로 시드**(chainId 31337 fork).
- 기존 화면은 "선택된 네트워크 = 그 1개"로 동작 → 무중단.

## 7. 단계 계획

- **P1**: DB(Prisma+SQLite) + `networks` 스키마 + 어드민 CRUD API + 어드민 "Networks" 탭(추가/목록/토글). 인증은 MVP(어드민 허용목록 + 서명 or 시크릿).
- **P2**: `GET /api/networks` → wagmi 동적 다중체인 + deployment 해석 교체. 서버 스캔이 chainId별 rpc 사용.
- **P3**: 마법사 네트워크 선택 + 캠페인에 chainId 부착 + Explore/상세 네트워크 인지. 지갑 체인 스위칭.
- **P4**: SIWE 세션 인증 정식화, 프로덕션 Postgres 전환.

## 8. 확정 결정 (2026-07-01)
1. **DB 기술**: ✅ **Prisma + SQLite** (프로덕션은 DATABASE_URL만 Postgres 교체)
2. **어드민 인증**: ✅ **SIWE**(지갑 서명 → 세션) + `platform_admins` 허용목록
