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
이게 하는 일: anvil로 Sepolia 포크(`:8545`) → 실 zkFactory/IdentityRegistry 위에 DropFactory 배포 →
MockERC20 fee/airdrop 토큰 → `contracts/deployments/11155111.json` 기록 →
데모 캠페인 시드(운영자·고객 검증 + createDrop). **anvil은 계속 실행**(Ctrl-C로 종료).

끝나면 출력의 **Frontend env**를 복사해 `apps/web/.env.local`에 붙인다:
```
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_DROP_FACTORY=0x...     # 출력값
NEXT_PUBLIC_FEE_TOKEN=0x...
NEXT_PUBLIC_AIRDROP_TOKEN=0x...
```
(또는 `cp contracts/deployments/11155111.json apps/web/public/deployment.json`)

> 백그라운드로 띄우려면: `scripts/dev-fork.sh &` 또는 별도 터미널 탭에서 실행.

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
- 지갑(MetaMask 등)에 **네트워크 추가**: RPC `http://127.0.0.1:8545`, chainId `11155111`.
- **claim 테스트:** 데모 고객 계정(anvil #1 `0x7099…79C8`) 임포트(공개 테스트키
  `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`) → 데모 캠페인에서 claim.
- **또는** 내 지갑을 §2로 검증 후 연결 → 생성 마법사(createDrop)·클레임·볼트 출금 클릭.

## 5. 종료
- 터미널 A에서 **Ctrl-C** → anvil 종료. (포크 상태는 휘발 — 다시 띄우면 새 배포)

---

## 현재 동작 범위 (main 기준)
- ✅ **claim / createDrop / withdrawFees** 실 트랜잭션 (M5 라이브)
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

## 트러블슈팅
- `SEPOLIA_RPC_URL` 없음 → §0 env 복사 확인.
- 프론트가 빈 화면/에러 → `apps/web/.env.local` 주소가 최신 배포(`deployments/11155111.json`)와 일치하는지.
- claim revert → 연결 지갑이 검증됨인지(§2) + 데모 고객/금액/proof 일치하는지.
