# scatter-drop — 설계 문서

## 1. 한 줄 정의
누구나 에어드랍 이벤트를 만들어 자기 고객에게 토큰을 뿌릴 수 있는 셀프서비스 멀티테넌트 플랫폼.
(단일 에어드랍 컨트랙트가 아니라, 여러 캠페인을 반복 운영하는 factory 구조.)

## 2. 대상
- **운영자(operator)**: 캠페인을 만들고 토큰을 예치하는 프로젝트 주체.
  **운영자용 CA 레지스트리로 신원검증을 마쳐야 캠페인 생성 가능**(§4.3-1).
- **고객(claimer)**: 자격이 있어 토큰을 클레임하는 최종 사용자.
  **캠페인이 지정한 고객용 CA 레지스트리로 신원검증을 마쳐야 수령 가능**(§4.3-2).
- **어드민(platform)**: 플랫폼 운영자 — 수수료 정책·트레저리 + **운영자용 CA 레지스트리(`operatorRegistry`) 등록·관리**.

## 3. 기술 스택
- 체인: **이더리움 L1 (메인넷)** — Solidity, Foundry
- 프론트: Next.js (App Router) + wagmi/viem
- 분배 방식: Merkle Distributor 기본 (온체인 root + proof self-claim)
- 토큰: ERC-20 (시작점)
- **신원 게이트: zk-X509 IdentityRegistry (CA 레지스트리) — 모든 캠페인 필수**
  (연동 프로젝트: `/Users/zena/tokamak-projects/zk-X509` — RegistryFactory / IdentityRegistry)
  신뢰 CA는 레지스트리마다 다름: **국가 PKI 또는 자체 발급 CA** (§4.3).

---

## 4. 핵심 아키텍처 결정

### 4.1 분배 방식 — Merkle Distributor 기본 채택
| 방식 | 가스 부담 | 확장성 | 운영 복잡도 | 비고 |
|------|----------|--------|-----------|------|
| **Merkle Distributor** ✅ | 유저(claim 시) | ★★★ (수십만+) | 중 | 온체인 root 1개, proof self-claim |
| 직접 전송(Disperse) | 운영자 | ★ (수백~수천) | 하 | 소규모 일회성 |
| 서명 기반(EIP-712) | 유저 | ★★★ | 상 | 동적/조건부 자격 |

→ 대상자 수에 무관하게 컨트랙트 비용 일정. 플랫폼 확장성에 가장 적합.

### 4.2 자격 산출 ↔ 분배 분리 (단, 예외 있음)
원칙: **자격 산출(누가 받나)**과 **분배(어떻게 주나)**를 분리한다.
대부분의 자격 방식(CSV·소셜·스냅샷 규칙)은 오프체인에서 `(address, amount)` 리스트로
환원되어 → Merkle 트리 → **동일한 MerkleDrop 컨트랙트**로 수렴한다.

**예외 — 온체인 검증형 규칙 기반:** "claim 시점의 온체인 상태(보유량·스테이킹)"를 조건으로
삼는 경우, 컨트랙트가 claim 시 직접 상태를 읽어 검증할 수 있다. 이때는 Merkle 트리로
환원되지 않고 **별도 컨트랙트(GatedDrop)**가 필요하다. (아래 5.2 참고)

### 4.3 신원 게이트 — zk-X509 CA 레지스트리 (2단계, 모두 필수)
신원검증은 **두 종류**로 분리된다. 둘은 **서로 다른 CA 레지스트리**를 쓴다.

> **신원검증의 본질 = "zk-X509 IdentityRegistry에 등록된 신원검증을 거쳤는가".**
> 그 레지스트리가 **신뢰하는 CA 집합이 무엇이냐는 레지스트리마다 다르다** — 국가 PKI(NPKI·정부 eID,
> 법적·실명)일 수도, **자체 발급 CA**(기업·조직 내부 PKI, 커뮤니티 자체 인증)일 수도 있다.
> zk-X509는 "X.509 인증서 기반 신원검증" 프레임워크이고, 인증서가 **국가 발급이든 자체 발급이든** 게이팅에 쓸 수 있다.
> → 캠페인마다 **신뢰 수준을 선택**: 실명 필수면 국가 CA 레지스트리, 조직 내부 분배면 자체 CA 레지스트리.

| | (1) 운영자 게이트 | (2) 고객 게이트 |
|---|---|---|
| 대상 | 캠페인을 **만드는** 지갑 | 에어드랍을 **받는** 지갑 |
| CA 레지스트리 | **전역 1개** (운영자 전용) | **캠페인마다** 운영자가 지정 |
| 등록·관리 주체 | **플랫폼 어드민** | 운영자 (생성 시 선택) |
| 강제 시점 | `createDrop`/`createGatedDrop` | `claim` |
| 온체인 판정 | `operatorRegistry.verifiedUntil(msg.sender) ≥ now` | `campaign.identityRegistry.verifiedUntil(msg.sender) ≥ now` |

> 두 레지스트리는 별개다. 운영자용 CA(예: 사업자/법인 인증)와 고객용 CA(예: 개인 실명 인증)는
> 서로 다른 신뢰 CA 집합을 가질 수 있다.

#### (1) 운영자 게이트 — 어드민이 전역 등록
- 플랫폼 어드민이 **운영자용 IdentityRegistry 주소(`operatorRegistry`)를 DropFactory에 전역 설정**한다.
- 캠페인을 만들려면 운영자 지갑이 그 레지스트리에서 **사전 신원검증**돼 있어야 한다.
  미검증 지갑은 `createDrop` 불가.
- 변경은 어드민만 가능(0/미설정이면 게이트 비활성 — 운영 정책상 비권장).

#### (2) 고객 게이트 — 캠페인마다 운영자 지정
- 모든 캠페인은 생성 시 **하나의 고객용 IdentityRegistry(`identityRegistry`) 주소**를 필수 지정한다.
- **불변 규칙(예외 없음):** 에어드랍을 **받는 지갑은 반드시** 그 레지스트리에서
  사전 신원검증을 마친 지갑이어야 한다. 미검증 지갑은 어떤 경우에도 수령 불가.
- **수령 지갑 = 신원검증 지갑 (동일성 강제):** claim은 self-claim만 허용하며
  `msg.sender`(수령자)가 곧 검증 대상이다. 제3자 대납·다른 주소로의 수령 불가.

#### 재사용 — 공유 정준(canonical) 레지스트리 (국가 CA가 대표 사례)
- **표준 IdentityRegistry를 한 번 만들어 전 캠페인이 재사용**한다. 운영자는 자기 레지스트리를
  새로 만들 필요 없이 **정준 레지스트리 주소를 지정**하면 됨.
- 가장 강력한 사례 = **국가수준 신원**(한국 NPKI: yessign·KICA / 정부 eID / 에스토니아 eID 등) 표준 레지스트리.
  단 자체 CA(기업·조직) 표준 레지스트리도 같은 방식으로 큐레이션·재사용 가능.
- **verify-once → claim-many:** 사용자가 그 레지스트리에 **한 번 신원검증하면**,
  그 레지스트리를 쓰는 **모든 캠페인에서 재검증 없이** 클레임 가능(`verifiedUntil`이 유효한 동안).
- 정준 레지스트리 큐레이션 주체:
  - **고객용:** 플랫폼이 국가별 표준 레지스트리(예: "KR-NPKI", "EE-eID")를 등록·관리하고
    운영자가 그중 선택. (직접 만든 커스텀 레지스트리도 허용)
  - **운영자용(operatorRegistry):** 어드민이 전역으로 하나(예: 사업자/법인 인증) 지정 — §4.3-1.
- 경제 효과: 신원검증 원가가 **캠페인마다 반복되지 않고 사용자당 1회로 분산** → 마찰·비용 ↓ (§8).

#### 공통
- **목적:** Sybil 방지 / 실명·소속 기반 자격 (1인 1클레임, 특정 국가·기관 한정 등).
- **자격 방식과 직교:** §5의 CSV·규칙·소셜 자격 위에 **항상 겹쳐지는 신원 게이트**.
  → **claim 조건 = (자격 방식 충족) AND (수령 지갑이 고객 CA 레지스트리에서 신원검증됨)**
  → **create 조건 = (운영자 지갑이 운영자 CA 레지스트리에서 신원검증됨)**
- **무개인정보:** 레지스트리는 zk 증명(nullifier·Merkle root·해시)만 저장 — 온체인에 개인정보 없음.

---

## 5. 자격(eligibility) 방식 — 캠페인마다 운영자가 선택

### 5.1 직접 업로드 (CSV)
- 운영자가 `(address, amount)` 명단을 직접 업로드
- 가장 단순. 명단을 정확히 아는 경우
- → 오프체인에서 Merkle 트리 생성 → MerkleDrop

### 5.2 규칙 기반 (온체인 상태) — 두 갈래
운영자가 주소 명단 대신 **온체인 상태 조건(rule)**을 정의한다.
조건 예: 토큰 N개 이상 보유 / 스테이킹 금액 ≥ 임계값(WTON·sWTON 등) / 특정 NFT 보유 /
특정 컨트랙트 상호작용 / 복합 AND·OR (예: "토큰 100개 이상 AND 30일 이상 스테이킹").
배분량은 고정 또는 보유·스테이킹량 비례로 산정.

| | (A) 스냅샷 방식 | (B) 기간 + 온체인 검증 방식 |
|---|---|---|
| 자격 판정 시점 | 과거/특정 블록 스냅샷 (1회 고정) | 운영자가 정한 **기간(claim window)** 내, claim 시 실시간 |
| 산출 위치 | 오프체인 인덱서가 명단 계산 | 컨트랙트가 claim 시 직접 조건 검증 |
| 명단 | 사전 확정된 자격자 리스트 | 사전 명단 없음 — 조건 충족자면 누구나 |
| 컨트랙트 | 기존 **MerkleDrop 재사용** | **별도 GatedDrop** 필요 |
| 가스 | 저렴(proof 검증만) | 높음(상태 조회+검증) |
| 특성 | 정적·소급 가능 | 동적·"기간 내 조건 충족"이면 OK |

**스냅샷 명단 산출 — v1은 Dune 활용 (자체 인덱서 불필요).**
"블록 N 기준 토큰 ≥ X 보유자 + 잔액" 같은 명단은 **Dune Analytics**로 뽑는다.
- 마법사가 입력값(토큰주소·스냅샷블록·최소수량·배분방식 균등/비례)으로 **Dune SQL 쿼리를 생성** →
  운영자가 Dune에서 실행 → 결과 **CSV 내보내기** → 마법사에 업로드(=CSV 경로로 수렴).
- 즉 v1 스냅샷 = "Dune 쿼리 생성기 + CSV 임포트"로 충분. 플랫폼 인덱서는 **후속(자동화)**.
- 비례 배분은 `(주소, 잔액)`에서 `총량 × 잔액/Σ잔액`으로 마법사가 계산.

→ 두 방식은 용도가 다름.
   - **(A) 스냅샷**: "과거 특정 블록 기준 홀더에게 보상" — 명단 고정, 소급.
   - **(B) 기간+조건**: "기간을 열어두고, 그 안에서 온체인 조건만 맞으면 클레임" — 명단 미리 안 만들고
     조건 충족 여부만 본다. 진행 중 새로 조건 충족한 지갑도 참여 가능.
   v1에서 어디까지 지원할지는 미결정(아래 11 참고).

### 5.3 소셜·태스크 기반 (백엔드 의존)
- 트위터 팔로우·디스코드 가입 등 퀘스트 완료자 (Galxe/Layer3 스타일)
- 백엔드 + OAuth + sybil 방지 필요
- → 완료자 명단을 오프체인에서 Merkle 트리로 환원 → MerkleDrop

---

## 6. 캠페인 생성 플로우 (운영자 마법사)
```
 1. 기본 정보       이름, 설명, 로고, 배포 토큰, 총량, 마감일
                   + zk-X509 CA 레지스트리 지정 (필수 — 신원 게이트, §4.3)
 2. 자격 방식 선택   ○ CSV 업로드  ○ 규칙 기반(스냅샷/온체인검증)  ○ 소셜·태스크
       └ CSV       → 파일 업로드 (address, amount)
       └ 규칙       → 조건 빌더(보유 ≥ N, 스테이킹 ≥ X, NFT, AND/OR) + 스냅샷 블록/실시간
       └ 소셜       → 퀘스트 설정(트위터/디스코드)
 3. 배포 방식 선택   ○ 즉시  ○ 베스팅(cliff+linear)  ○ 선착순
 4. 미리보기        자격자 수·총 배분량 확인 → (Merkle 방식이면) 트리 생성
 5. 생성 & 결제      수수료(토큰 방식: %또는 정액, 같은 토큰, on-top) — approve(총량+수수료) → createDrop
```
온체인 검증 방식을 제외하면 4단계에서 동일한 명단으로 수렴 → Merkle 트리 → 배포.

---

## 7. 컨트랙트 구조
```
DropFactory (어드민이 수수료방식·feeBps·flatFee, operatorRegistry, allowedToken 관리 + 수수료 볼트 보관)
 ├ operatorRegistry                          운영자용 CA 레지스트리 (어드민 전역 설정)
 ├ defaultFeeMode → FeeMode (초기 PERCENT)   전역 기본 수수료 방식 (§8)
 ├ feeMode[token] → {PERCENT,FLAT}           토큰별 수수료 방식. 미설정=defaultFeeMode
 ├ defaultFeeBps → uint16 (초기 50=0.5%)     PERCENT 전역 기본율 (§8)
 ├ feeBps[token] → uint16                    PERCENT 토큰별 율(bps). 미설정=defaultFeeBps. ≤ MAX_FEE_BPS
 ├ flatFee[token] → uint256                  FLAT 토큰별 정액. FLAT인데 0이면 미설정→revert
 ├ tokenTier[address] → {NONE,ALLOWED}       에어드랍 토큰 화이트리스트 (§8.7, 어드민 큐레이션)
 ├ setOperatorRegistry(addr)   onlyAdmin     운영자 신원 게이트 변경
 ├ setDefaultFeeMode(mode)     onlyAdmin     전역 기본 방식 변경
 ├ setFeeMode(token, mode)     onlyAdmin     토큰별 방식 PERCENT/FLAT 설정
 ├ setDefaultFeeBps(bps)       onlyAdmin     PERCENT 전역 기본율 (≤ MAX_FEE_BPS)
 ├ setFeeBps(token, bps)       onlyAdmin     PERCENT 토큰별 율. ≤ MAX_FEE_BPS
 ├ setFlatFee(token, amount)   onlyAdmin     FLAT 토큰별 정액
 ├ setAllowedToken(token, on)  onlyAdmin     ★토큰 허가/해제 (어드민 전용 — 플랫폼 적합 토큰 큐레이션). 운영자 셀프등록 없음
 ├ createDrop(type, airdropToken, merkleRoot, totalAmount, startTime, deadline, identityRegistry)
 │     · type ∈ {CSV, ONCHAIN_SNAPSHOT, SOCIAL}. 수수료 = feeMode별(PERCENT: floor(totalAmount × bpsOf/10000) / FLAT: flatFee[token]), on-top. (§8)
 │     · 클레임 윈도우 [startTime, deadline] — require(deadline > startTime) + (deadline - startTime >= MIN_DURATION) + deadline > now
 │     0a. require(operatorRegistry.verifiedUntil(msg.sender) >= now)  운영자 신원검증 (게이트1)
 │     0b. require(zkFactory.isRegistry[identityRegistry])             정식 고객 CA 레지스트리 검증
 │     0c. require(tokenTier[airdropToken] != NONE)                    어드민 허가 토큰만 배포 (§8.7)
 │     1. fee = feeMode(airdropToken)==PERCENT ? totalAmount × bpsOf/10000 : flatFee[token]  (FLAT은 >0 보장, §8)
 │     2. airdropToken.safeTransferFrom(operator, newDrop, totalAmount)   배포 풀(전액)
 │     3. airdropToken.safeTransferFrom(operator, address(this), fee)     수수료 볼트(같은 토큰) → collectedFees[airdropToken]+=fee
 │     4. MerkleDrop 배포 (identityRegistry 주입)
 │     (운영자 사전 approve = totalAmount + fee. exact-receipt(_pullExact)로 fee-on-transfer 거부.)
 ├ createGatedDrop(airdropToken, ruleConfig, totalAmount, startTime, deadline, identityRegistry)  온체인 검증
 │     · type = ONCHAIN_GATED. 동일 % 수수료(on-top) + 게이트 + GatedDrop 배포  [후속]
 ├ collectedFees(token) → uint              ★ 볼트 적립 잔액 조회 (토큰별, 배포 토큰으로 적립)
 └ withdrawFees(token, to, amount)  onlyAdmin ★ 수수료 볼트 출금 (treasury 고정, 플랫폼 어드민만)

MerkleDrop (캠페인 1개 — CSV·소셜·스냅샷 규칙)
 ├ startTime / deadline                    클레임 윈도우 (불변). [시작, 마감]
 ├ identityRegistry                        zk-X509 IdentityRegistry (필수, 불변)
 ├ claim(index, account, amount, proof)    ⓪ now∈[startTime,deadline] ① 신원검증(verifiedUntil≥now) ② proof 검증 후 self-claim
 ├ isClaimed(index) → bool                 중복 방지 (bitmap)
 ├ sweep()                                 마감(deadline) 후 운영자 잔여 회수
 └ view: token, merkleRoot, startTime, deadline, identityRegistry, totalClaimed

GatedDrop (캠페인 1개 — 온체인 검증 규칙)  [후속 단계]
 ├ identityRegistry                        zk-X509 IdentityRegistry (필수, 불변)
 ├ claim()                                 ① 신원검증 ② 온체인 조건 직접 검증 후 지급
 ├ ruleConfig                              보유/스테이킹 임계값 등
 ├ sweep()
 └ view: token, deadline, identityRegistry, totalClaimed

신원검증 (양 컨트랙트 공통, claim 선행 조건):
  require(IIdentityRegistry(identityRegistry).verifiedUntil(msg.sender) >= block.timestamp)
```

---

## 8. 이코노미 (수익 모델)
- **생성 수수료 방식을 어드민이 토큰별로 선택: 거래액 비율(PERCENT) 또는 정액(FLAT).**
  - **PERCENT**(기본): 수익이 거래량에 비례 = Σ(배포량×율). 많이·크게 뿌릴수록 수익↑(인센티브 정렬).
    토큰 가치 차이는 토큰별 율로 해소(가치 낮은 토큰 율↑). 기본 0.5%.
  - **FLAT**: 캠페인당 토큰별 정액. 배포량 무관 고정 수익(예측 가능). 안정 토큰·특정 정책에 유용.
  - 결제 토큰 = **배포 토큰과 동일**(별도 납부토큰 선택 없음).
- **수수료는 총량에 "추가"(on-top) — 운영자 부담.** 운영자가 1000을 뿌리려면 `1000 + fee`를 예치.
  배포 풀에는 **1000 전액**이 들어가고(수령자 영향 0), 수수료분은 **수수료 볼트**에 적립.
- 어드민이 `collectedFees(token)`로 토큰별 조회, `withdrawFees`로 treasury 출금.

### 수수료 방식 = 토큰별 PERCENT / FLAT 선택 (어드민)
어드민이 **토큰마다 수수료 방식을 선택**한다: 거래액 비율(%) 또는 정액(flat).
- `enum FeeMode { PERCENT, FLAT }`. 토큰별 `feeMode[token]`, 미설정 토큰은 **defaultFeeMode(기본 PERCENT)**.
- **PERCENT 방식:** `fee = floor(totalAmount × bpsOf(token) / 10000)`.
  `bpsOf(token) = feeBps[token]` (미설정=`defaultFeeBps`, 기본 50bps=0.5%). `≤ MAX_FEE_BPS`(예 1000=10%).
  예) 1000 토큰 × 50bps = 5.
- **FLAT 방식:** `fee = flatFee[token]` (캠페인 크기와 무관한 토큰별 정액). 토큰별 `setFlatFee(token, amount)`.
  FLAT인데 `flatFee[token]==0`이면 미설정 → **revert FeeNotConfigured**(무료 우회 방지).
  예) flatFee[TON]=10 → 캠페인이 1000 뿌리든 100만 뿌리든 수수료 10 TON.
- 두 방식 공통: **on-top**(운영자 예치 = 총량 + fee), 같은 토큰, 볼트 적립.

### bpsOf/feeOf 결정 + createDrop 납부 흐름
```
fee = feeMode(airdropToken) == PERCENT
      ? totalAmount × bpsOf(airdropToken) / 10000
      : flatFeeOf(airdropToken)        // FLAT, >0 보장(아니면 revert)
```
- 운영자 approve(airdropToken, totalAmount + fee) → createDrop:
  `safeTransferFrom(operator, drop, totalAmount)` (풀) + `safeTransferFrom(operator, this, fee)` (볼트)
  → `collectedFees[airdropToken] += fee`. (airdropToken은 ERC-20, ETH 배포 비지원.) `withdrawFees` treasury 고정.

### 어드민 전역 설정·권한 항목
| 항목 | 설명 |
|------|------|
| **feeMode[token]** | **토큰별 수수료 방식 PERCENT/FLAT. 미설정=defaultFeeMode(기본 PERCENT). setFeeMode(token,mode)** |
| **defaultFeeMode** | **전역 기본 방식(초기 PERCENT). setDefaultFeeMode** |
| **feeBps[token] / defaultFeeBps** | **PERCENT 방식 율(bps). 미설정=defaultFeeBps(50=0.5%). setFeeBps, setDefaultFeeBps. ≤ MAX_FEE_BPS** |
| **flatFee[token]** | **FLAT 방식 정액(토큰별). setFlatFee(token,amount). FLAT인데 0이면 미설정→createDrop revert** |
| **수수료 볼트** | **수수료가 DropFactory에 적립(배포 토큰으로). `collectedFees(token)` 조회** |
| **withdrawFees** | **볼트 출금 — 플랫폼 어드민만 (`onlyAdmin`)** |
| **operatorRegistry** | **운영자용 CA 레지스트리 — 캠페인 생성 신원 게이트(§4.3-1)** |

### 비용 부담 주체
| 주체 | 부담 |
|------|------|
| 운영자 | 생성 수수료(feeOf[type]) + 배포 토큰 전액 예치 + createDrop 가스 + 운영자 1회 신원검증 |
| 고객 | claim 가스 (self-claim) + **기본 금융 신원 확인 1회**(재사용) |
| 플랫폼 | 인프라(웹/proof 저장/인덱싱) + 표준 레지스트리 큐레이션 |

### 신원검증 마찰의 상각 (verify-once → claim-many)
- 국가수준 "기본 금융 신원" 표준 레지스트리를 재사용하므로, 고객의 신원검증은
  **사용자당 1회**로 끝나고 그 뒤 모든 캠페인에서 무마찰 클레임.
- 즉 신원검증 원가/마찰이 **캠페인 수에 비례하지 않고 사용자 수에 1회**로 상각됨 →
  캠페인이 늘수록 1인당 평균 마찰 ↓, 플랫폼 망 효과(network effect) 발생.
- 첫 검증만 넘기면 재방문 전환율이 높아져 운영자 입장의 분배 효율도 개선.

### 검토했으나 보류한 모델 (참고)
- 배포액 비례 수수료(%) — 토큰 가치산정 어려움
- 클레임당 수수료 — 고객 경험 마찰, 전환율↓
- 구독(SaaS) / 플랫폼 토큰 — 복잡도·규제 부담, 초기 비추

---

## 8.5 경쟁 지형 & 포지셔닝
(2026-06 웹 조사 기준. 출처는 문서 말미 참고.)

### 시장은 세 진영으로 갈린다
**① 분배 도구 (신원 게이트 없음)** — 분배 메커니즘은 우리와 동일(Merkle self-claim)
| 프로젝트 | 핵심 | 수수료 | 신원/KYC |
|---|---|---|---|
| **Merkl** | JSON 업로드 → Merkle self-claim, 수백만 주소 가스 0 | **0.5% 배포액 비례** | 없음 |
| **Galxe Earndrop** | 태스크/크리덴셜 기반 분배, 지갑 필터 | 플랫폼 의존 | 시빌 필터 수준 |
| **Layer3** | 복잡한 퀘스트 미션 | — | 없음 |
| **Disperse / ethers-airdrop** | 단순 직접 전송 / Merkle OSS | 무료 | 없음 |
→ 분배는 같지만 신원이 없음. Merkl의 **0.5% 비례 수수료**가 시장 가격대(우리는 종류별 고정 수수료로 차별).

**② 인간증명(Proof of Personhood) — 신원은 있으나 분배 플랫폼이 아님**
| 프로젝트 | 핵심 | 우리와 차이 |
|---|---|---|
| **Human Passport (Holonym, 前 Gitcoin Passport)** | PoP 크리덴셜, 120+ 프로젝트·$512M 보호, gov-ID zk 스탬프 추가 중 | "고유 인간"이지 **법적 실명(KYC) 아님** |
| **World ID** | 홍채 기반 익명 인간증명 | 익명 PoP, 관할/컴플라이언스 분배 불가 |
| **Humanity Protocol** | 손바닥 생체 + zk | 생체 PoP, 국가 CA 아님 |
→ **결정적 구분: PoP ≠ KYC.** 이들은 "봇 아닌 인간"을, 우리는 **법적 효력 있는 국가 실명/금융 신원**
   (한국 NPKI = 전자서명법상 법적 구속력)을 증명. 규제·RWA·증권형 분배엔 PoP로 부족.

**③ zk-KYC / 컴플라이언스 — 가장 가까운 위협**
| 프로젝트 | 핵심 | 차이 |
|---|---|---|
| **zkPass** | zkTLS로 Web2 데이터 증명, zkKYC 스위트, **로드맵에 "gated airdrops" 명시** | 거래소/Web2 KYC를 zk로 **재증명** vs 우리는 국가 PKI 인증서 직접. 분배 플랫폼은 아직 로드맵 |
→ 토큰·유통·자금 보유. 가장 빨리 옆에서 넘어올 수 있는 경쟁자.

### 우리의 위치 — 빈 교집합
**scatter-drop = ①분배 플랫폼 × ③국가-PKI 법적 KYC.** 이 교집합을 productize한 경쟁자는 현재 없음.
- 기반 기술 zk-X509는 **2026-03 arxiv 논문(2603.25190)**으로 등장한 최신 연구이며, 논문조차 airdrop을
  응용으로 명시하지 않음 → 우리가 **분배 플랫폼으로 처음 제품화**하는 자리.
- 논문의 "단일 IdentityRegistry가 한국 NPKI·독일 eID 동시 수용" = 우리의 verify-once 재사용 설계와 일치.

### 포지셔닝 (확정)
- **한 줄:** "누구나 에어드랍" ❌ → **"법적으로 유효한 신원검증 기반 컴플라이언트 토큰 분배"** ✅.
- **차별화 메시지 = 법적 효력.** PoP("당신은 인간")가 아니라 **법적 실명 분배**(전자서명법·eIDAS).
- **타깃:** 실명·관할·컴플라이언스가 *필수*인 분배 — RWA·증권형·규제 토큰, 기업 배당/멤버십,
  지역 한정 보상, 시빌로 데인 프로젝트. (익명 대량 살포형은 우리 시장 아님 — Merkl/Galxe로.)

### 해자 & 리스크
- **해자:** (a) 빈 교집합 선점, (b) 재사용 가능한 **검증된 사용자 풀**(망 효과), (c) 법적 효력은 PoP가 대체 불가.
- **리스크:** (a) **zkPass**가 분배를 붙이기 전 선점 못 하면 추격당함 — *속도가 생명*,
  (b) Holonym이 gov-ID 스탬프로 경계 침범(이미 120+ 프로젝트 네트워크 보유),
  (c) zk-X509 기술/논문의 **독점성·라이선스 방어 가능성**이 해자의 전제 — 오픈이면 zkPass도 동일 적용 가능,
  (d) 본질 리스크는 여전히 **"신원 필수 분배" 시장의 크기**와 닭-달걀(사용자 풀 시드).

### 출처
- Merkl Airdrop Docs/Solution · Galxe Earndrop · Human Passport(Holonym) · World ID
- zkPass(zkpass.org, 로드맵) · ZK-KYC(Mitosis) · PoP vs KYC(cryptoadventure)
- zk-X509 paper: arxiv.org/abs/2603.25190

---

## 8.6 법적·규제 고려
> 면책: 본 섹션은 법률 자문이 아니며, 출시 전 한국·미국 가상자산 전문 변호사 검토가 필수다.

### 에어드랍이 건드리는 4개 법 영역
에어드랍 자체는 불법이 아니나 다음 규제 대상이다.
1. **증권법** — "무료 배포"도 면제가 아님. 수령자가 "타인의 노력에 의한 가치 상승"을 기대하면
   Howey 테스트에 걸려 **미등록 증권 판매**로 볼 수 있음(예: SEC v. Tomahawk). 토큰 성격(유틸리티 vs 투자)에 좌우.
2. **세금** — 다수 관할에서 수령자는 수령 시점 시가(FMV)에 소득세 부담(미국 IRS=ordinary income). 한국도 과세 진행.
3. **AML / 제재(sanctions)** — 제재 대상 국가·인물 배포 시 OFAC 등 위반. 한국 특금법 + 가상자산이용자보호법(2024).
4. **소비자·마케팅법** — "공짜 토큰" 유인의 기만적 마케팅 해석 여지.

### 신원검증이 곧 규제 방어막 (제품 = 컴플라이언스 인프라)
위 리스크는 대부분 **익명 에어드랍의 문제**이며, scatter-drop의 신원 게이트가 정면으로 완화한다.
| 리스크 | 완화 방식 |
|--------|----------|
| AML/제재 | 국가 PKI 실명검증 → 제재 대상·미인증자 차단 |
| 관할 규제 | CA 레지스트리로 지역 한정 분배 |
| 시빌/사기 | 1인 1신원 → 봇 차단 |
| KYC 의무 | 은행권 수준 신원검증 통과자만 |
→ 규제가 강해질수록 익명 도구(Merkl 등)는 불리, 우리는 유리. §8.5 포지셔닝과 일치.

### 플랫폼 책임 분리 (운영자 ≠ 플랫폼)
- 책임 대부분이 **토큰 발행/캠페인 운영자**에 귀속되도록 설계 — 플랫폼은 *비수탁 인프라 제공자*.
- 그래도 필요한 장치:
  - **ToS·면책조항** (운영자 책임 명시, 세금은 수령자 책임 고지)
  - **제재국 지역 차단**(IP/지역) + 미결정: 증권형 토큰 배포 금지 정책 또는 별도 심사
  - **토큰 비수탁 구조 유지**(예치 토큰은 캠페인 컨트랙트가 보관, 플랫폼 임의 인출 불가)
  - 수수료 수취로 *촉진*하므로 완전 면책은 아님 → 정책·심사로 보강.
- v1 미결정(§12 후속): 증권형 배제 심사 절차, 지역 차단 범위, ToS 초안.

---

## 8.7 에어드랍 토큰 등록 (어드민 큐레이션 화이트리스트)
에어드랍에 쓸 토큰은 온체인 **토큰 등록부**에 있어야 한다(`createDrop`이 강제). 등록은 **플랫폼 어드민 전용**이다 — 운영자는 토큰을 추가할 수 없다.
어드민은 **에어드랍에 쓰기 적절한 established 토큰만 추려서** 허가한다 — 예: WETH(이더), USDC·USDT 등 스테이블코인, 검증된 블루칩.
> 어드민은 토큰의 **증권성을 판정하지 않는다.** "플랫폼에 쓰기 적절한 established 자산인가"만 본다(결제처리사가 지원 자산 목록을 두는 것과 동일).
> 명백히 적절한 자산으로 한정하면 증권 리스크는 *실무상* 회피되지만, 플랫폼이 증권 판정 주체가 되지는 않는다 → **중립 인프라 유지**(§8.6).

### 등급 모델 (`tokenTier[address]`)
| 등급 | 누가 등록 | 의미 | createDrop |
|------|----------|------|-----------|
| **ALLOWED** | 플랫폼 어드민 (`setAllowedToken`) | 어드민이 플랫폼 적합성 기준 큐레이션 | 가능 |
| **NONE** | — | 미허가 (기본값) | **불가** |

> 이전의 운영자 셀프 등록(`addAllowedToken`, COMMUNITY 퍼미션리스)은 **폐지**. 운영자가 임의 토큰을
> 등록·분배하면 사칭·악성·부적절 토큰 리스크 → 어드민이 추린 established 토큰만 허용.

### 원칙
- **어드민 전용 허가:** `setAllowedToken(token, bool)` (onlyAdmin)만 토큰을 ALLOWED/NONE로 전환.
  운영자용 `addAllowedToken` 인터페이스 **없음**.
- **적합성 큐레이션 = 어드민의 오프체인 판단:** 컨트랙트는 "화이트리스트에 있는가"만 강제한다.
  어드민은 등록 전 **"플랫폼에 쓰기 적절한 established 자산인가"**(유동성·널리 쓰임·비악성·비사칭)를 보고 허가하되,
  **증권 여부는 판정하지 않는다.** 명백히 적절한 자산으로 한정하는 것 자체가 증권 리스크의 실무적 회피.
- **모더레이션:** 문제 토큰은 어드민이 `setAllowedToken(token, false)`로 제거(→ NONE).
- **createDrop 게이트:** `require(tokenTier[airdropToken] != NONE)`. 미허가면 생성 불가
  (운영자가 추가할 방법 없음 — 어드민에게 등록 요청).

### 프론트 (FRONTEND-IA 반영)
- **생성 마법사 토큰 선택:** **토큰 주소 직접입력 란만** 제공(picker·"+ 토큰 추가" 버튼 모두 없음).
  운영자가 배포할 토큰 주소를 입력 → 화이트리스트(isAllowed) 검증. 미허가면 "미허가 토큰 — 어드민에 등록 요청" 안내, 진행 차단.
  (운영자는 토큰을 추가할 수 없다. 지원 토큰 관리는 전적으로 플랫폼 어드민.)
- **어드민 화면:** 토큰 등록부 관리 — `setAllowedToken` 허가/해제, 허가 목록, **컴플라이언스 근거(증권 등록정보) 메모**.

### 메타데이터
온체인은 주소+등급만. 심볼·이름·로고는 토큰의 ERC-20 메타(symbol/name) + 오프체인 보강(로고 등).

---

## 9. 데이터 흐름 (Merkle 방식 기준)
1. 운영자가 자격 방식에 따라 명단 확보 (CSV 업로드 / 인덱서 스냅샷 / 소셜 완료자)
2. `packages/merkle`가 Merkle 트리 생성 → root + proofs.json
3. 운영자가 **zk-X509 CA 레지스트리 지정**(필수) + `DropFactory.createDrop`로 캠페인 배포 + 수수료 지불 + 토큰 예치
4. proofs.json은 IPFS 핀서비스(Filebase/Pinata, 자체노드 X) 업로드 → CID를 DropCreated 이벤트에 기록.
   고객은 클레임 페이지가 그 CID로 proofs.json 로드 → 자기 proof 조회. (데모는 시드 고정 proof)
5. 고객이 (필요 시) 지정 CA 레지스트리에 zk-X509 신원검증 등록 → `verifiedUntil` 세팅
6. 고객이 `claim()` 호출(가스 자가 부담) → 신원검증 확인 후 토큰 수령
7. 마감 후 운영자가 `sweep()`로 미클레임 토큰 회수

---

## 10. v1 범위 & 구현 순서

### 전체 기능을 v1에 포함하되, 안전하게 쌓아 올리는 Build Order
1. **코어 컨트랙트** — DropFactory + MerkleDrop, 고정 수수료, CSV→Merkle, self-claim, sweep,
   **+ zk-X509 신원 게이트 2종(운영자=어드민 등록 / 고객=캠페인 지정, 모두 필수)**
2. **대시보드 기본** — 캠페인 생성/조회, 클레임률·잔여·참여자 통계, 예치 증명 표시
3. **자격 확장** — 스냅샷 규칙(인덱서) → 온체인 검증 규칙(GatedDrop) → 소셜·태스크(백엔드)
4. **배포 방식 확장** — 베스팅(cliff+linear), 선착순
5. **UX 확장** — 클레임 페이지 브랜딩, 이메일/지갑 알림
6. **인프라 확장** — 가스리스(Permit2/relayer), 멀티체인 배포
7. **신뢰·보안** — 감사, 타임락/멀티시그 (전 단계 적용)

### 무거운 의존성 (별도 서브시스템 — 일정 영향 큼)
- 온체인 검증 규칙: GatedDrop 컨트랙트(상태 조회 로직)
- 소셜/태스크 자격: 백엔드 + OAuth + sybil 방지
- 가스리스: relayer 인프라 또는 Permit2
- 멀티체인: 체인별 배포·proof·브리지
- 이메일 알림: 이메일 인프라 + 지갑↔이메일 매핑(프라이버시)

### 기능 → 단계 매핑
- 자격 다양화(CSV/규칙(스냅샷·온체인)/소셜) — [3단계]
- 배포 방식(즉시/베스팅/선착순) — [4단계]
- 운영자 편의(CSV 자동 트리·대시보드·sweep) — [1·2단계], 멀티체인 — [6단계]
- 고객 경험(브랜딩·알림) — [5단계], 가스리스 — [6단계]
- 신뢰·보안(감사·예치 증명·타임락/멀티시그) — [7단계]

---

## 11. 폴더 구조 (monorepo)
```
contracts/       Foundry — DropFactory, MerkleDrop, GatedDrop, 테스트
packages/merkle/ CSV → Merkle 트리/proof 생성 라이브러리
apps/web/        Next.js 대시보드 + 클레임 페이지
scripts/         배포/운영 스크립트
docs/            설계 문서
```

---

## 12. 미결정 사항
- 온체인 검증 규칙(GatedDrop)을 v1 어느 시점에 넣을지 / 스냅샷 방식만 먼저 할지
- 규칙 스냅샷 시점: 과거 특정 블록(소급) vs 생성 시점
- 인덱서 데이터 소스: 노드 RPC 직접 조회 / The Graph / 자체 인덱싱 DB
- 수수료 기본 화폐: USDC / WTON / ETH (어드민 변경 가능하나 기본값 필요)
- 수수료 토큰 단일 고정 vs 복수 허용 (초기엔 단일 고정 추천)
- 수수료 면제 화이트리스트
- 캠페인 메타데이터(이름/로고) 저장 위치 (오프체인 DB 예정)
- zk-X509 CA 레지스트리: 캠페인당 **단일 고정 vs 복수(OR)** 허용 (초기엔 단일 고정 추천)
- 신원검증 만료(`verifiedUntil`)가 claim 시점 이전이면 처리 (재검증 유도 / claim 차단)

### 결정됨 (참고)
- **수령 지갑 = 신원검증 지갑 동일 강제** (§4.3). self-claim만 허용, 제3자 대납·타주소 수령 불가.
  CSV 명단의 주소는 곧 신원검증해야 할 지갑이며, 미검증이면 claim 불가.
- **proof(proofs.json) 저장 = IPFS 핀서비스 (Filebase/Pinata 무료 티어), 자체 노드 불필요.**
  - 근거: proofs.json은 root에 묶인 **불변** 데이터 → content-addressing(CID)과 정합. 검열저항(플랫폼이
    죽어도 claim 가능). 크기 작음(1만 명 ≈ 5MB) → 무료 티어로 캠페인 수천 개. 사실상 0원. 온체인 저장은 비싸서 제외.
  - 운영: 자체 IPFS 노드 안 띄움 — Filebase(S3 호환 API, 5GB 무료) 또는 Pinata에 업로드만. S3만큼 단순.
  - **CID 위치: `DropCreated` 이벤트에 proofsCid 필드 추가**(온체인) → 프론트가 별도 메타 DB 없이 자동 조회.
    (대안: 오프체인 메타 DB. 이벤트 방식이 DB 불필요해서 우선.)
  - **단계: v1 데모/포크 = 저장 없이 시드 고정 proof(현 동작). 출시 v1 = 핀서비스 + 이벤트 CID 연동.** [후속 작업]
