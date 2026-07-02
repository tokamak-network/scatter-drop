# 로컬 브라우저 테스트 가이드 (Sepolia 포크)

`scripts/dev-fork.sh` 한 줄로 **실제 zk-X509 위에 DropFactory를 배포한 클릭 가능한 환경**을 띄운다.
아래는 검증된 절차다. (참고: `docs/ENVIRONMENTS.md` = 배경/주소)

## 0. 사전 준비 (1회)
- **Foundry**(anvil/forge), **pnpm ≥ 8**, **Node ≥ 20**.
- 서브모듈: `git submodule update --init --recursive`
- 의존성: `pnpm install`
- **`contracts/.env`** 에 Sepolia RPC + 배포키 (gitignored). scatter-dex 것 재사용:
  ```bash
  grep -E '^(SEPOLIA_RPC_URL|DEPLOYER_KEY)=' \
    /Users/zena/tokamak-projects/scatter-dex/contracts/.env > contracts/.env
  ```
  (키는 커밋·출력 금지. `.env`/`.env.*`는 .gitignore에 포함됨.)

## 1. 터미널 A — 포크 + 배포 + 데모 캠페인 (백그라운드로 유지)
```bash
scripts/dev-fork.sh
```
이게 하는 일: anvil로 Sepolia 포크(`:8545`, **chain-id 31337** 로 relabel) → 실 zkFactory/IdentityRegistry 위에
DropFactory 배포 → MockERC20 fee/airdrop 토큰 → `contracts/deployments/31337.json` 기록 →
데모 캠페인 시드(운영자·고객 검증 + createDrop). **anvil은 계속 실행**(Ctrl-C로 종료).

끝나면 출력의 **Frontend env**를 복사해 `apps/web/.env.local`에 붙인다:
```
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_DROP_FACTORY=0x...     # 출력값
NEXT_PUBLIC_FEE_TOKEN=0x...
NEXT_PUBLIC_AIRDROP_TOKEN=0x...
```
(env는 **레지스트리(DB)가 비었을 때의 폴백**이다 — §1b에서 DB에 네트워크를 시드하면 그게 우선한다.)

> 백그라운드로 띄우려면: `scripts/dev-fork.sh &` 또는 별도 터미널 탭에서 실행.

## 1b. 백엔드 DB (Prisma) — 네트워크 레지스트리 셋업

"백엔드"는 **별도 서버가 아니라** Next.js의 `/api/*` 라우트 + **Prisma SQLite 파일 DB**다.
멀티네트워크 지원(#61~#64) 이후, 앱은 **어떤 체인에 어떤 DropFactory가 있는지를 DB의
`networks` 레지스트리에서 해석**한다(env/`deployment.json`은 폴백). 따라서 DB에 현재 포크
네트워크를 시드해야 한다. `pnpm install` 시 Prisma 클라이언트는 자동 생성된다(postinstall).

```bash
# (1회) DB 연결 문자열 — Prisma는 apps/web/.env 를 읽는다
echo 'DATABASE_URL="file:./dev.db"' > apps/web/.env

# 스키마 → SQLite 파일 생성 (idempotent)
pnpm --filter @scatter-drop/web exec prisma db push

# 시드: 플랫폼 어드민(anvil #0) + 현재 포크 네트워크(31337)
#   개선된 seed가 방금 배포된 contracts/deployments/31337.json 의 factory 주소를 읽어
#   네트워크 row를 생성/갱신한다 → 재배포 후 이 한 줄만 다시 돌리면 주소가 맞춰진다.
node apps/web/prisma/seed.mjs
```

> **어드민 로그인**: 브라우저에서 anvil #0(`0xf39F…2266`)로 지갑 연결 → **Admin → Networks 탭
> → "Sign in with wallet"**(SIWE 서명, 가스 없음) → 네트워크 목록/추가/토글.
> `SESSION_SECRET`은 dev 폴백을 쓴다(프로덕션은 `apps/web/.env`에 ≥32자 필수).

## 2. (선택) 내 지갑을 게이트 통과시키기
데모 고객(anvil #1)이 아닌 **내 지갑**으로 claim/create 하려면, 그 주소를 포크에서 검증됨 처리:
```bash
scripts/dev-verify.sh 0xMY_WALLET_ADDRESS
```
(IdentityRegistry의 `verifiedUntil`을 미래로 오버라이드 — zk 증명 없이 게이트 통과)

## 3. 터미널 B — 프론트 dev 서버
```bash
pnpm --filter @scatter-drop/web dev
# → http://localhost:3000
```

## 4. 브라우저에서 클릭
- 지갑(MetaMask 등)에 **네트워크 추가**: RPC `http://127.0.0.1:8545`, chainId `31337`.
- **claim 테스트:** 데모 고객 계정(anvil #1 `0x7099…79C8`) 임포트(공개 테스트키
  `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`) → 데모 캠페인에서 claim.
- **또는** 내 지갑을 §2로 검증 후 연결 → 생성 마법사(createDrop)·클레임·볼트 출금 클릭.

## 5. 종료 / 재시작

### 종료
- 터미널 A에서 **Ctrl-C** → anvil 종료. 터미널 B에서 **Ctrl-C** → dev 서버 종료.
- (포크 상태는 휘발 — 다시 띄우면 새 배포/새 주소)

### 떠 있는 걸 강제로 내리기 (스크립트 한 줄)
터미널을 잃었거나 백그라운드로 띄웠을 때 — **`scripts/dev-down.sh`** 가 웹(:3000)과
anvil(:8545)을 한 번에 내린다(TERM → 안 죽으면 KILL):
```bash
scripts/dev-down.sh            # 웹 + anvil 종료
scripts/dev-down.sh --clean    # + .dev-logs 삭제
# 포트가 다르면: WEB_PORT=3001 ANVIL_PORT=8545 scripts/dev-down.sh
```
> 수동으로 하려면: `lsof -ti tcp:8545 | xargs kill` (anvil), `lsof -ti tcp:3000 | xargs kill` (프론트).
> anvil은 인메모리라 내리면 배포 컨트랙트가 사라진다(재포크가 어차피 재배포하므로 정상).

### 코드가 바뀐 뒤 깨끗하게 재시작 (가장 흔한 경우)
컨트랙트/SDK가 바뀌면 **반드시 anvil을 새로 띄워 재배포**해야 한다(옛 anvil엔 옛 컨트랙트).
```bash
# 0) 기존 것 내리기
scripts/dev-down.sh

# 1) 최신 코드 + 의존성
git pull
pnpm install

# 2) 포크 재기동 + 재배포 (터미널 A)
scripts/dev-fork.sh
#   → 끝의 "Frontend env" 5줄을 apps/web/.env.local에 다시 붙임 (주소가 새로 바뀜!)

# 3) 백엔드 DB 재시드 (필수!) — 새 factory 주소를 레지스트리에 반영
node apps/web/prisma/seed.mjs

# 4) 내 지갑 다시 검증 (포크가 새로 떠서 초기화됨)
scripts/dev-verify.sh 0xMY_WALLET

# 5) 프론트 재시작 (터미널 B)
pnpm --filter @scatter-drop/web dev
```
> 핵심: **dev-fork.sh를 새로 돌리면 DropFactory 주소가 매번 바뀐다**. 앱은 이제 DB 레지스트리에서
> factory를 해석하므로 **3)의 `seed.mjs`를 반드시 다시 돌려야** 새 주소가 반영된다(안 하면 옛
> factory로 읽어 화면이 빈다). `.env.local`도 갱신하면 폴백까지 일치.
> 프론트 코드만 바뀐 경우(컨트랙트 그대로)는 dev 서버가 핫리로드하므로 anvil/DB 재작업 불필요.

---

## 현재 동작 범위 (main 기준)
- ✅ **claim / createDrop / withdrawFees** 실 트랜잭션 (M5 라이브)
- ✅ **TON 원-트랜잭션 생성(approveAndCall→onApprove)** — TON류(approveAndCall) 토큰은 한 번의 tx로 생성 (PR #69·#75). 아래 "TON 원-트랜잭션 테스트" 참고
- ✅ **신원 게이트** 실 verifiedUntil 검증
- 🔄 **Explore 캠페인 목록**(getLogs) — PR #25 머지 후 라이브 (그 전엔 stub)
- 🔄 **다토큰 수수료(ETH/TON 할인)** — PR #26(W19) 머지 후

## 기능·메뉴 테스트 체크리스트 (페르소나별)
전체 메뉴·기능 설명은 **`docs/FRONTEND-IA.md`**. 아래는 지금 포크에서 클릭해볼 항목.

### 🙋 고객 (Claimer) — 받는 사람
| 메뉴 | 기능 | 테스트 | 지금? |
|------|------|--------|:---:|
| Explore `/campaigns` | 전체 캠페인 둘러보기 | 데모 캠페인 카드 보이는지 | 🔄 #25 후 |
| 캠페인 상세 `/c/[id]` | 신원게이트 + 자격확인 + claim | 데모 고객(anvil#1)으로 claim 1000토큰 | ✅ |
| | 신원 미검증 차단 | 검증 안 한 지갑 → "신원 인증 필요" | ✅ |
| My Claims `/claim` | 내 클레임 현황 | 연결 지갑 기준 표시 | ✅(보조) |

### 👤 운영자 (Operator) — 캠페인 만드는 사람
| 메뉴 | 기능 | 테스트 | 지금? |
|------|------|--------|:---:|
| Manage `/manage` | 내가 만든 캠페인 | 목록·통계 | ✅ |
| New Campaign `/manage/new` | 생성 마법사 | Step1 기본정보→자격(CSV)→배포방식→결제 | ✅ |
| | createDrop 실행 | approve→createDrop 실 tx | ✅ |
| | **TON 원-트랜잭션 생성** | 토큰 셀렉터에서 **TON** 선택 → 단일 "Create in one transaction (approveAndCall)" | ✅ |
| | 토큰 등록(없으면 추가) | "+토큰추가"(addAllowedToken) | 🔄 W19-FE 후 |
| | 납부토큰 선택(ETH/TON 할인) | 결제 단계 토큰 셀렉터 | 🔄 W19 후 |
| 캠페인 관리 `/manage/[id]` | Overview/Participants/Sweep | 통계·잔여회수 | ✅ |
| 세금문서 `/manage/[id]/report` | 분배내역 CSV/PDF | 다운로드 | ✅ |

### 🛠 어드민 (Platform Admin)
| 메뉴 | 기능 | 테스트 | 지금? |
|------|------|--------|:---:|
| `/admin/funds` | 종류별 수수료 설정 | setFee | ✅ (다토큰은 🔄 W19) |
| `/admin/operator` | 운영자 CA 레지스트리 | setOperatorRegistry | ✅ |
| `/admin/vault` | 수수료 볼트 조회·출금 | collectedFees / withdrawFees→treasury | ✅ |
| `/admin/tokens` | 토큰 등록부 관리 | OFFICIAL 지정/제거 | 🔄 W19-FE 후 |
| `/admin/campaigns` | 전체 캠페인 모니터 | 개수·캠페인별 | ✅(read) |

> ✅=지금 클릭 가능, 🔄=해당 PR 머지 후. (Explore=#25, 다토큰수수료·토큰UI=W19/#26)

### 데모 시드 값 (claim 테스트용)
- 데모 drop: 출력의 `drop` 주소 / 고객 anvil#1 `0x7099…79C8`, 금액 1000e18, proof는 dev-fork 출력 참조.

### TON 원-트랜잭션(approveAndCall) 테스트
- 포크는 **실제 Sepolia TON**(`0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`)을 allow-list + `setApproveAndCallSupport(address token, bool supported)`(=`(TON, true)`)로 구성하고, `dev-fork.sh`가 **whale 임퍼소네이트**로 운영자(anvil #0)에게 TON을 넣어준다(실제 토큰이라 mint 불가).
- 마법사 `/manage/new`에서 에어드랍 토큰으로 **TON**을 고르면 approveAndCall 지원이 자동 감지되어 버튼이 **단일 "Create in one transaction"**으로 바뀐다. 표준 토큰(DROP)은 approve→create 2단계 유지.
- 어드민 `/admin` → Tokens 탭에서 토큰별 **Enable/Disable one-tx** 토글(`setApproveAndCallSupport`)도 확인 가능.
- 관련 env (모두 선택 사항):
  - `FUND_TON=false` — TON 자금 조달 단계 건너뛰기
  - `TON_WHALE=0x…` — 자금 출처 홀더 변경 (기본 `0xB68AA9E398c054da7EBAaA446292f611CA0CD52B`)
  - `TON_FUND_WEI=…` — 지급량 wei (기본 `1000000000000000000000000` = 1,000,000 × 10¹⁸ = 100만 TON)
  - `TON_ADDRESS=0x…` — 다른 approveAndCall 토큰으로 교체 (DeployFork)
- ⚠️ 실제 TON은 `transferFrom` 호출자 제한(sender/recipient만) + approveAndCall의 **ERC165 `onApprove` 검사**를 한다. 팩토리의 `supportsInterface`(PR #75)가 없으면 `"ERC20OnApprove: spender doesn't support onApprove"`로 리버트한다.

## 트러블슈팅
- `SEPOLIA_RPC_URL` 없음 → §0 env 복사 확인.
- **프론트가 빈 화면/캠페인 안 보임** → 십중팔구 **DB 레지스트리의 factory가 stale**. 재배포 후
  `node apps/web/prisma/seed.mjs`를 다시 돌렸는지(§5-3), 또는 Admin→Networks에서 factory가
  최신 `deployments/31337.json`과 일치하는지 확인.
- `prisma` 에러("table does not exist" 등) → `pnpm --filter @scatter-drop/web exec prisma db push`
  재실행. `apps/web/.env`에 `DATABASE_URL="file:./dev.db"` 있는지.
- 어드민 Networks 탭에서 "Sign in" 후 403 → 연결 지갑이 `platform_admins`에 없음. 시드된
  어드민은 anvil #0(`0xf39F…2266`). 다른 지갑을 쓰려면 seed.mjs의 `OWNER`에 추가.
- claim revert → 연결 지갑이 검증됨인지(§2) + 데모 고객/금액/proof 일치하는지.
