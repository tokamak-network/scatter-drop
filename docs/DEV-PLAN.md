# scatter-drop — 개발 계획 (v1)

`docs/DESIGN.md` · `docs/FRONTEND-IA.md` 기반. 현재 저장소는 **그린필드**(빈 모노레포 폴더).
연동: `/Users/zena/tokamak-projects/zk-X509` (RegistryFactory / IdentityRegistry).

## 0. 범위 합의 (v1 = P0만)

**포함 (P0):**
- 코어 컨트랙트: `DropFactory` + `MerkleDrop`
- 신원 게이트 2종: 운영자(전역 `operatorRegistry`) / 고객(캠페인별 `identityRegistry`)
- 종류별 차등 생성 수수료 + 수수료 볼트(조회·어드민 출금)
- CSV → Merkle 트리/proof 생성 라이브러리
- 최소 프론트: Explore · 캠페인 상세/클레임 · Manage(생성·Overview·Participants·Sweep) · Admin

**제외 (후속):** GatedDrop(온체인 검증), 소셜·태스크 백엔드, 베스팅/선착순, 가스리스, 멀티체인, 알림.

**개발 원칙(전역 워크플로우 준수):**
개발 → 최적화 → `simplify` → 테스트 → 커밋/푸시/PR → 봇 리뷰 반영 → merge(일반 merge).

---

## 1. 마일스톤 개요

| M | 이름 | 산출물 | 의존 |
|---|------|--------|------|
| **M0** | 모노레포 부트스트랩 | Foundry·pnpm·CI 골격 | — |
| **M1** | merkle 패키지 | CSV→tree/root/proofs 라이브러리 + 테스트 | M0 |
| **M2** | 코어 컨트랙트 | DropFactory + MerkleDrop + 신원게이트 + 볼트 | M0 |
| **M3** | 배포·시드 스크립트 | anvil 로컬 E2E(zk-X509 레지스트리 연동) | M1·M2 |
| **M4** | 프론트 기반 | Next.js + wagmi/viem + 지갑연결 + 라우팅 | M0 |
| **M5** | 클레임 경로 | Explore·캠페인 상세·IdentityGate·claim | M2·M3·M4 |
| **M6** | 운영자 경로 | Manage·생성 마법사·Participants·Sweep | M5 |
| **M7** | 어드민 경로 | Funds(종류별)·Identity Registries·Vault·캠페인 모니터 | M6 |
| **M8** | 통합·하드닝 | E2E·보안 점검·문서 | M5–M7 |

---

## 2. 컨트랙트 상세 (M2)

### 2.1 인터페이스 (zk-X509 의존, 읽기 전용)
```solidity
interface IIdentityRegistry {           // zk-X509 IdentityRegistry
    function verifiedUntil(address) external view returns (uint64);
}
interface IRegistryFactoryLike {         // zk-X509 RegistryFactory
    function isRegistry(address) external view returns (bool);
}
```

### 2.2 DropFactory
- 상태: `owner(admin)`, `feeToken`, `feeOf[AirdropType]`, `operatorRegistry`, `zkFactory`,
  `registries[]`, `collectedFees(token)`.
- `enum AirdropType { CSV, ONCHAIN_SNAPSHOT, ONCHAIN_GATED, SOCIAL }`
- 어드민: `setFee(type,amount)`, `setFeeToken`, `setOperatorRegistry`, `withdrawFees(token,to,amount)`.
- `createDrop(type, airdropToken, merkleRoot, totalAmount, deadline, identityRegistry)`:
  1. `require(IIdentityRegistry(operatorRegistry).verifiedUntil(msg.sender) >= block.timestamp)` (게이트1)
  2. `require(zkFactory.isRegistry(identityRegistry))` (정식 고객 레지스트리)
  3. `feeToken.safeTransferFrom(msg.sender, address(this), feeOf[type])` → 볼트 적립
  4. `airdropToken.safeTransferFrom(msg.sender, drop, totalAmount)`
  5. `new MerkleDrop(...)` 배포 + 레지스트리 기록 + 이벤트.
- 뷰: `collectedFees`, `registriesLength`, `registryAt(i)`.

### 2.3 MerkleDrop
- 불변: `factory`, `token`, `merkleRoot`, `deadline`, `identityRegistry`, `owner(operator)`.
- `claim(index, account, amount, proof)`:
  1. `require(block.timestamp <= deadline)`
  2. `require(account == msg.sender)` (self-claim, 수령=검증 지갑 동일)
  3. `require(IIdentityRegistry(identityRegistry).verifiedUntil(msg.sender) >= block.timestamp)` (게이트2)
  4. `require(!isClaimed(index))` + Merkle proof 검증 (bitmap)
  5. `token.safeTransfer(msg.sender, amount)` + 이벤트.
- `isClaimed(index)`, `sweep()` (deadline 후 operator만 잔여 회수), 뷰 일체.

### 2.4 테스트 (Foundry, 목표 커버리지 핵심 경로 100%)
- 단위: createDrop 게이트1 통과/실패, 종류별 수수료 적립, claim 게이트2 통과/실패,
  self-claim 강제(account≠sender 리버트), 중복 claim, 만료, sweep 권한·시점.
- mock: `MockIdentityRegistry`(verifiedUntil 조절), `MockRegistryFactory`(isRegistry),
  `MockERC20`.
- 퍼즈: proof/index, 금액 경계. 인바리언트: 볼트 잔액 = Σ수수료 − Σ출금.

---

## 3. merkle 패키지 상세 (M1)
- 입력 `(address, amount)[]` (CSV 파싱·체크섬·중복·합계 검증).
- 출력: `merkleRoot`, `proofs.json`(index·account·amount·proof), `totalAmount`.
- 컨트랙트와 **leaf 인코딩·정렬 규칙 동일** 보장(교차 테스트로 고정).
- 테스트: 알려진 벡터, 대량(수만) 성능, 컨트랙트 검증과 라운드트립.

---

## 4. 프론트 상세 (M4–M7)
- 스택: Next.js(App Router) + wagmi/viem + viem 타입 ABI. 메인넷 + anvil 로컬.
- 라우팅(FRONTEND-IA 그대로): `/`, `/campaigns`, `/c/[id]`, `/claim`, `/manage`, `/manage/new`,
  `/manage/[id]`, `/admin/*`.
- 공통 컴포넌트: WalletConnect, NetworkBanner, IdentityGate, CARegistryPicker(표준 우선),
  EligibilityCheck, TxStatus, EmptyState.
- 데이터: 캠페인 메타(이름/로고)는 오프체인(우선 정적/간이 DB), 온체인은 factory 이벤트 인덱싱.
  v1은 직접 RPC 조회 + 이벤트 스캔(별도 인덱서 후속).

### 화면별 수용 기준(AC) 요약
- **M5 클레임:** 미검증 지갑 → IdentityGate가 등록 유도, claim 차단. 검증·자격 충족 시 claim 성공.
  My Claims 없어도 상세에서 자격 즉석 판정.
- **M6 생성:** Step0 운영자 검증 차단 동작. Step2 종류 선택 시 `feeOf[type]` 즉시 표시.
  Participants: 자격자/검증/클레임/미클레임 수·클레임률·추이·CSV 내보내기.
- **M7 어드민:** 종류별 수수료 설정, operatorRegistry/표준 레지스트리 큐레이션,
  볼트 잔액 조회·출금, 전체 캠페인 수·캠페인별 대시보드.

---

## 5. 실행 순서 (스프린트)

> 각 항목은 전역 워크플로우(개발→최적화→simplify→테스트→PR→리뷰반영→merge) 1사이클 = 1 PR 권장.

**Sprint 1 — 토대**
1. M0 부트스트랩 (Foundry init, pnpm 워크스페이스, CI: forge test + lint)
2. M1 merkle 패키지 (라이브러리 + 테스트)

**Sprint 2 — 컨트랙트 (P0 핵심)**
3. M2 MerkleDrop (claim/게이트2/sweep) + 테스트
4. M2 DropFactory (createDrop/게이트1/종류별수수료/볼트) + 테스트
5. M3 배포·시드 스크립트 + anvil 로컬 E2E (zk-X509 mock/실연동)

**Sprint 3 — 클레임 경로**
6. M4 프론트 기반(지갑연결·라우팅·ABI)
7. M5 Explore + 캠페인 상세 + IdentityGate + claim

**Sprint 4 — 운영자/어드민**
8. M6 Manage(생성 마법사·Overview·Participants·Sweep)
9. M7 Admin(Funds·Identity Registries·Vault·캠페인 모니터)

**Sprint 5 — 마무리**
10. M8 통합 E2E + 보안 점검(`/security-review`) + 문서 갱신

---

## 6. 리스크 & 선결 확인
- **zk-X509 배포 주소/네트워크:** 로컬(anvil)에서 RegistryFactory/IdentityRegistry를 어떻게 띄울지
  (서브모듈 vs 사전배포 주소). → M3 전 확정 필요.
- **leaf 인코딩 일치:** merkle 패키지 ↔ 컨트랙트. → M1/M2 교차 테스트로 고정.
- **표준 레지스트리 시드:** 데모용 KR-NPKI 레지스트리(테스트 CA)로 verify-once 흐름 시연.
- **withdrawFees 출금 대상 정책:** 임의 to vs 고정 treasury (보안). → M2 착수 전 결정(미결정).
- **캠페인 메타 저장소:** v1 간이 방식 확정(정적 JSON/Firestore 등).

---

## 7. 첫 액션 (바로 시작 가능)
- [ ] M0: `contracts/` Foundry 초기화 + OZ/solmate 의존 + CI
- [ ] M0: pnpm 워크스페이스(`apps/web`, `packages/merkle`) + 루트 스크립트
- [ ] 선결: withdrawFees 출금 정책 / zk-X509 로컬 기동 방식 2건 결정
