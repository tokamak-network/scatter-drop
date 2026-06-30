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

#### 재사용 — 국가수준 CA는 공유 정준(canonical) 레지스트리
- **국가수준 신원**(한국 NPKI: yessign·KICA / 정부 eID / 에스토니아 eID 등)을 쓰는 경우,
  대표 국가 CA들을 묶은 **표준 IdentityRegistry를 한 번 만들어 전 캠페인이 재사용**한다.
  운영자는 자기 레지스트리를 새로 만들 필요 없이 **정준 레지스트리 주소를 지정**하면 됨.
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
 5. 생성 & 결제      수수료(feeToken) 지불 + 토큰 예치 → createDrop / createGatedDrop
```
온체인 검증 방식을 제외하면 4단계에서 동일한 명단으로 수렴 → Merkle 트리 → 배포.

---

## 7. 컨트랙트 구조
```
DropFactory (어드민이 feeToken, feeOf[type], operatorRegistry, allowedToken 관리 + 수수료 볼트 보관)
 ├ operatorRegistry                          운영자용 CA 레지스트리 (어드민 전역 설정)
 ├ feeOf[feeToken][AirdropType] → uint       (납부토큰,종류)별 생성 수수료 (어드민, address(0)=ETH, §8)
 ├ tokenTier[address] → {NONE,COMMUNITY,OFFICIAL}  에어드랍 토큰 등록·등급 (§8.7)
 ├ setOperatorRegistry(addr)   onlyAdmin     운영자 신원 게이트 변경
 ├ setFee(feeToken, type, amount) onlyAdmin  (납부토큰,종류)별 수수료 설정 (TON 할인 등). 0=그 토큰 미허용
 ├ addAllowedToken(token)      operator      검증 운영자가 직접 등록(승인 불요) → COMMUNITY. 게이트1 + token.code>0
 ├ setOfficialToken(token,on)  onlyAdmin     플랫폼 공식 토큰 지정/해제 → OFFICIAL (목록 상단 노출)
 ├ removeAllowedToken(token)   onlyAdmin     악성 토큰 제거 → NONE (모더레이션)
 ├ createDrop(type, airdropToken, merkleRoot, totalAmount, deadline, identityRegistry, feeToken)  payable
 │     · type ∈ {CSV, ONCHAIN_SNAPSHOT, SOCIAL}  (오프체인 명단 → Merkle). feeToken=납부수단(0=ETH)
 │     0a. require(operatorRegistry.verifiedUntil(msg.sender) >= now)  운영자 신원검증 (게이트1)
 │     0b. require(zkFactory.isRegistry[identityRegistry])             정식 고객 CA 레지스트리 검증
 │     0c. require(tokenTier[airdropToken] != NONE)                    등록 토큰만 배포 (미등록 시 운영자가 addAllowedToken)
 │     1. (ETH) require(msg.value==feeOf[0][type]) / (ERC20) transferFrom feeOf[feeToken][type] → 볼트 적립
 │     2. airdropToken.transferFrom(operator, newDrop, totalAmount)   배포 토큰 예치
 │     3. MerkleDrop 배포 (identityRegistry 주입)
 ├ createGatedDrop(airdropToken, ruleConfig, totalAmount, deadline, identityRegistry)  온체인 검증
 │     · type = ONCHAIN_GATED, 수수료 feeOf[ONCHAIN_GATED]
 │     동일한 운영자검증 + 수수료/예치 + 고객 레지스트리 검증 + GatedDrop 배포
 ├ collectedFees(token) → uint              ★ 볼트 적립 잔액 조회 (토큰별)
 └ withdrawFees(token, to, amount)  onlyAdmin ★ 수수료 볼트 출금 (플랫폼 어드민만)

MerkleDrop (캠페인 1개 — CSV·소셜·스냅샷 규칙)
 ├ identityRegistry                        zk-X509 IdentityRegistry (필수, 불변)
 ├ claim(index, account, amount, proof)    ① 신원검증(verifiedUntil≥now) ② proof 검증 후 self-claim
 ├ isClaimed(index) → bool                 중복 방지 (bitmap)
 ├ sweep()                                 마감 후 운영자 잔여 회수
 └ view: token, merkleRoot, deadline, identityRegistry, totalClaimed

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
- **에어드랍 종류별 × 결제 토큰별 차등 생성 수수료.** 금액이 ① 종류(자격 방식) ② **납부 토큰**에 따라 다르다.
  - 종류별 차등 근거: 종류마다 플랫폼 원가(인덱서·백엔드·sybil 방지)가 달라서.
  - **토큰별 차등 = 결제 수단 인센티브.** 여러 토큰으로 납부 가능하고 토큰마다 가격이 다르다.
    예) **TON으로 내면 ETH보다 할인** — 어드민이 TON 가격을 더 낮게 설정.
- 운영자는 생성 시 **납부 토큰을 선택**(ETH=native / TON 등 ERC-20). 해당 토큰의 종류별 금액만큼 **볼트에 적립**.
  플랫폼 어드민이 `collectedFees(token)`로 토큰별 조회, `withdrawFees`로 출금.
- 배포할 에어드랍 토큰과 수수료 납부 토큰은 **별개**. 특정 토큰의 금액 0 = 그 토큰으론 무료/미허용.

### 생성 수수료 = feeOf[feeToken][AirdropType] (2차원)
어드민이 **(납부토큰, 종류)별로** 금액 설정: `setFee(feeToken, type, amount)`. `feeToken=address(0)`은 native ETH.
| | CSV | ONCHAIN_SNAPSHOT | ONCHAIN_GATED | SOCIAL |
|---|---|---|---|---|
| **ETH** (정가) | 저 | 중 | 중상 | 고 |
| **TON** (할인) | 저×할인 | 중×할인 | … | … |
> 종류별 차등(인덱서·백엔드 원가 반영) + 토큰별 차등(TON 할인 등 인센티브)을 곱으로 적용.
> 미설정(0)인 (토큰,종류) 조합은 그 토큰으로 결제 불가.

### createDrop 납부 흐름 (payable)
- `feeToken == address(0)`(ETH): `require(msg.value == feeOf[0][type])` → `collectedFees[0] += msg.value`.
- `feeToken != 0`(ERC-20, 예 TON): `require(msg.value == 0)` + `require(feeOf[feeToken][type] > 0)`(허용) →
  `safeTransferFrom(operator, vault, feeOf[feeToken][type])` → `collectedFees[feeToken] += amount`.
- `withdrawFees`는 ETH(address(0), call 전송) / ERC-20 모두 지원, treasury 고정.

### 어드민 전역 설정·권한 항목
| 항목 | 설명 |
|------|------|
| **feeOf[token][type]** | **(납부토큰, 종류)별 생성 수수료 — TON 할인 등 토큰별 차등. 0=그 토큰 미허용** |
| **수수료 볼트** | **생성 수수료가 DropFactory에 적립. `collectedFees(token)`로 잔액 조회** |
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

## 8.7 에어드랍 토큰 등록 (퍼미션리스 + 공식 큐레이션)
에어드랍에 쓸 토큰은 온체인 **토큰 등록부**에 있어야 한다(`createDrop`이 강제). 등록은 **승인 절차 없이**
이뤄지되, 표시 우선순위를 위해 **등급(tier)**을 둔다.

### 등급 모델 (`tokenTier[address]`)
| 등급 | 누가 등록 | 의미 | 목록 노출 |
|------|----------|------|-----------|
| **OFFICIAL** | 플랫폼 어드민 (`setOfficialToken`) | 플랫폼이 공식 인정한 토큰 | **상단 우선** |
| **COMMUNITY** | 검증된 운영자 (`addAllowedToken`) | 운영자가 셀프 등록(승인 불요) | 공식 다음 |
| **NONE** | — | 미등록 | createDrop 불가 |

### 원칙
- **승인 불요(퍼미션리스):** 운영자가 에어드랍하려는 토큰이 목록에 없으면 **직접 `addAllowedToken`로 추가**.
  PR·어드민 승인 과정 없음. 단 **게이트1(검증 운영자)** + `token.code.length>0`(컨트랙트 여부) 기본검증으로 스팸 차단.
- **공식 우선 노출:** 어드민이 `setOfficialToken`으로 지정한 토큰이 토큰 선택 UI에서 **항상 먼저** 표시.
  나머지(커뮤니티)는 그 아래(예: 최근 등록순/심볼순).
- **사후 모더레이션:** 악성·사칭 토큰은 어드민이 `removeAllowedToken`으로 제거(→ NONE). 사전 검열 아님.
- **createDrop 게이트:** `require(tokenTier[airdropToken] != NONE)`. 미등록이면 운영자가 먼저 등록(마법사가 "토큰 추가" 버튼 제공 → 같은 트랜잭션 흐름).

### 프론트 (FRONTEND-IA 반영)
- **생성 마법사 토큰 선택:** OFFICIAL 그룹 먼저 → COMMUNITY 그룹. 검색 가능. 없으면 "+ 토큰 추가"(addAllowedToken).
- **어드민 화면:** 토큰 등록부 관리 — setOfficialToken 지정/해제, removeAllowedToken, 등급별 목록.

### 메타데이터
온체인은 주소+등급만. 심볼·이름·로고는 토큰의 ERC-20 메타(symbol/name) + 오프체인 보강(로고 등).

---

## 9. 데이터 흐름 (Merkle 방식 기준)
1. 운영자가 자격 방식에 따라 명단 확보 (CSV 업로드 / 인덱서 스냅샷 / 소셜 완료자)
2. `packages/merkle`가 Merkle 트리 생성 → root + proofs.json
3. 운영자가 **zk-X509 CA 레지스트리 지정**(필수) + `DropFactory.createDrop`로 캠페인 배포 + 수수료 지불 + 토큰 예치
4. proofs.json은 오프체인 저장(IPFS/S3), 고객은 클레임 페이지에서 proof 조회
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
- proof 저장: IPFS vs S3
- 캠페인 메타데이터(이름/로고) 저장 위치 (오프체인 DB 예정)
- zk-X509 CA 레지스트리: 캠페인당 **단일 고정 vs 복수(OR)** 허용 (초기엔 단일 고정 추천)
- 신원검증 만료(`verifiedUntil`)가 claim 시점 이전이면 처리 (재검증 유도 / claim 차단)

### 결정됨 (참고)
- **수령 지갑 = 신원검증 지갑 동일 강제** (§4.3). self-claim만 허용, 제3자 대납·타주소 수령 불가.
  CSV 명단의 주소는 곧 신원검증해야 할 지갑이며, 미검증이면 claim 불가.
