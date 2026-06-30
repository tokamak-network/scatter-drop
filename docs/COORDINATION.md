# scatter-drop — 협업 코디네이션 (K0 플래너)

멀티세션 협업 운영 문서. **K0 = 플래너/코디네이터(통합·리뷰·배정)**, K1+ = 워커.
코디네이션 채널: `claude-coord-mcp` (register/set_status/broadcast/check_inbox).

## 0. 세션 역할

| 세션 | 역할 | 담당 |
|------|------|------|
| **K0** | 플래너/통합 | 배정·인터페이스 확정·PR 리뷰/머지·문서 정본화 |
| **K1** | 워커: 컨트랙트 | M2 DropFactory/MerkleDrop, M3 배포·E2E |
| **K2** | 워커: SDK/merkle | M1 SDK 골격, 컨트랙트 클라이언트·훅 |
| **K3** | 워커: 프론트 | M4 기반, M5/M6/M7 화면 |

> 워커 수는 가변. K1만 가동 시 K0가 직렬 배정. 추가 세션은 위 역할로 흡수.

## 1. 병렬 스트림과 인터페이스 시임(seam)

병렬화의 핵심 = **세 시임을 K0가 먼저 고정**하면 스트림이 독립적으로 진행.

```
Stream C (컨트랙트)  ──ABI/시그니처 시임──┐
                                          ├─→ Stream S (SDK) ──API 시임──┐
Stream M (merkle, 완료) ──leaf 인코딩 시임─┘                             ├─→ Stream F (프론트)
                                                                         ┘
```

### 시임 ① leaf 인코딩 — **확정(완료)**
`keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))` + OZ 정렬페어.
`packages/merkle`에 구현·테스트 완료(commit 8900721). 컨트랙트는 이 규칙을 **그대로** 따른다.

### 시임 ② 컨트랙트 ABI/시그니처 — **확정(DEV-PLAN §2)**
워커가 바꾸려면 K0 승인 필요. 프론트/SDK는 이 시그니처에 맞춰 선행 개발 가능.
```
DropFactory.createDrop(uint8 airdropType, address airdropToken, bytes32 merkleRoot,
                       uint256 totalAmount, uint64 deadline, address identityRegistry)
DropFactory.setFee(uint8 type, uint256 amount) / setFeeToken / setOperatorRegistry / setTreasury
DropFactory.withdrawFees(address token, uint256 amount)   // → treasury 고정 출금
DropFactory.collectedFees(address token) view
MerkleDrop.claim(uint256 index, address account, uint256 amount, bytes32[] proof)
MerkleDrop.isClaimed(uint256 index) view / sweep()
enum AirdropType { CSV, ONCHAIN_SNAPSHOT, ONCHAIN_GATED, SOCIAL }
```

### 시임 ③ SDK API 표면 — **확정(DEV-PLAN §3.2)**
`@tokamak-network/scatter-drop-sdk` subpath: `./core ./merkle ./identity ./claim ./react ./types ./util`.
프론트는 이 표면에 맞춰 개발(미구현분은 SDK가 stub 제공).

## 2. 작업 규칙 (전역 워크플로우 준수)

1. **브랜치/PR 단위:** 1 작업 = 1 브랜치 = 1 PR. `feat/<stream>-<short>` (예: `feat/contracts-merkledrop`).
2. **사이클:** 개발 → 최적화 → `simplify` → 테스트 → 커밋·푸시·PR → 봇 리뷰 반영 → merge(일반 merge, `--delete-branch`).
3. **충돌 방지:** 스트림별 디렉토리 소유 — C=`contracts/`, S=`packages/{sdk,merkle}`, F=`apps/web`. 교차 변경은 K0 경유.
4. **시임 변경 금지:** §1의 세 시임은 K0 승인 없이 변경 불가. 변경 필요 시 broadcast로 제안.
5. **머지 순서:** 시임 의존 따라 K0가 **머지 순서만** 지정(컨트랙트 ABI → SDK → 프론트). 순서가 풀린 PR은 작성자가 머지.

### 2.1 자기 PR은 자기가 (혼선 방지)
- **PR 작성자가 자기 PR을 끝까지 책임진다:** 봇 리뷰 모니터링 → 인라인 답글(반영 커밋 SHA 포함) → 머지.
- **다른 사람 PR의 봇 피드백을 대신 읽거나 라우팅하지 않는다.** (K0 포함 — 혼선의 원인)
- **머지 조건(작성자가 자가 확인):**
  1) 로컬 전체 테스트 green (forge test / vitest) + PR 본문에 "local: N tests pass" 명시(영문)
  2) 봇(Copilot/Gemini) 인라인 코멘트 전부 인라인 답글로 닫음(반영=커밋SHA, decline=근거)
  3) K0가 지정한 **머지 순서 차례**일 것(의존 PR). 독립 PR은 아무 때나.
  4) CI는 비활성(프로덕트 완성 후 등록) — 체크탭 비어도 정상.
  5) **다운스트림 빌드 게이트 (CI 없으니 수동):** 시그니처/ABI를 바꾸는 PR은 다운스트림까지 빌드 확인.
     - 컨트랙트 시그니처 → SDK(abis/builders) → `pnpm --filter @tokamak-network/scatter-drop-sdk test`(드리프트가드 포함)
     - SDK export/시그니처 → apps/web → `pnpm --filter @scatter-drop/web build` 1회
     - 깨지면 같은 PR에서 최소 호환 픽스(필드 기본값 등) 또는 다운스트림 담당 동시 핑+머지순서 조정.
     - PR 본문에 `downstream: web build ✅/N-A` 한 줄. (교훈: W20-SDK 8-arg가 web 빌드 조용히 깸 → #33 핫픽스)
- **K0 역할(축소):** 배정·시임 동결·머지순서/의존 시퀀싱·충돌 중재·통합. PR별 봇 처리·머지는 작성자.
- **머지 순서 GO:** K0가 broadcast로 "머지 GO" 통지(의존 해소 시). 받은 작성자가 자기 PR 머지.

## 3. 코디네이션 프로토콜 (claude-coord-mcp)

- **시작 시:** `register_session(K#, role)` + `set_status(working, <task>)`.
- **작업 보고:** 상태 변경/PR 생성/블록 시 `set_status` 갱신. 막히면 `status=blocked` + 사유.
- **K0 호출:** 리뷰 요청·시임 변경 제안은 `send_message(to K0)` 또는 `broadcast`.
- **K0 배정:** K0가 `broadcast`로 작업 배정. 워커는 `check_inbox`로 수신.
- **종료 시:** `set_status(done, <요약>)`. 보드 정리는 K0.

## 4. 현재 배정 큐 (K0 관리)

| # | 작업 | 스트림 | 의존 | 담당 | 상태 |
|---|------|--------|------|------|------|
| W0 | M0 부트스트랩 | — | — | K0 | ✅ 완료 |
| W1 | M1 merkle 라이브러리 | M | 시임① | K0 | ✅ 완료(8900721) |
| W2 | M1 SDK 골격(merkle/types/util 재노출) | S | W1 | **K0** | 진행 |
| W3 | M2 MerkleDrop(claim·게이트2·sweep)+공유인터페이스+공유Mock | C | 시임② | **K1** | 배정 |
| W4 | M2 DropFactory(게이트1·종류별수수료·고정treasury볼트)+테스트 | C | W3(머지순서) | **K2** | 배정 |
| W5 | M3 배포·시드·anvil E2E(zk-X509 mock) | C | W4 | K1/K2 | 대기 |
| W6 | M4 프론트 기반(지갑·라우팅·stub) | F | 시임③ | **K3** | 배정 |
| W7 | SDK core 클라이언트(viem, ABI 연동) | S | W4 | K0/K2 | 대기 |
| W8+ | M5/M6/M7 화면 | F | W6·W7 | K3 | 대기 |

### 파일 소유 (겹침 0)
- **K1**: `contracts/src/MerkleDrop.sol`, `contracts/src/interfaces/IIdentityRegistry.sol`,
  `contracts/test/MerkleDrop.t.sol`, `contracts/test/mocks/{MockERC20,MockIdentityRegistry}.sol` (공유 Mock SoT)
- **K2**: `contracts/src/DropFactory.sol`, `contracts/src/interfaces/IRegistryFactoryLike.sol`,
  `contracts/test/DropFactory.t.sol`, `contracts/test/mocks/MockRegistryFactory.sol`
- **K3**: `apps/web/**`
- **K0**: `packages/**`, `docs/**`, 통합·리뷰·머지
- 머지 순서: **W3(K1) → W4(K2)**. K2는 시임② 시그니처로 병렬 작성, K1 머지 후 리베이스·테스트.

## 5. 선결 결정 (K0 확정)
- **withdrawFees:** 고정 `treasury`로만 출금(`setTreasury` + `withdrawFees(token, amount)`). ✅
- **zk-X509 로컬:** M2/M3는 인터페이스+mock 격리, 실연동은 M3. ✅
- **세금 문서 다운로드(신규):** 운영자·고객 세금 신고용 문서 다운로드 — 보고 기능, M6/M7(P2)에 배치. 별도 트래킹.
