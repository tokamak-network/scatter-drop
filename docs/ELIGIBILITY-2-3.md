# 자격 방식 2(온체인 상태) · 3(소셜·활동) — 상세 설계 & 구현 계획

DESIGN §5.2/§5.3의 구체화. 1번(CSV→Merkle)은 완료. 이 문서는 2·3번을 "어떻게 만들지"까지.

핵심 관점: **두 방식 모두 결국 `(address, amount)` 명단으로 환원되면 기존 MerkleDrop로 수렴한다.**
다른 건 "명단을 누가/어떻게 만드느냐"뿐. 단 2번의 한 갈래(실시간 검증)만 별도 컨트랙트가 필요하다.

---

# 자격 2 — 온체인 상태 기반

운영자가 주소 명단 대신 **조건(rule)**을 정의. "토큰 N개 이상 보유 / 스테이킹 ≥ X / NFT 보유 / 컨트랙트 상호작용 / AND·OR".
두 갈래로 나뉜다 — **2A(스냅샷)**과 **2B(실시간 검증)**. 난이도·인프라가 완전히 다름.

## 2A — 스냅샷 방식 (과거 블록 기준 명단 산출) ★ v1+ 먼저

### 동작
"블록 N 시점에 조건 충족한 주소 + (균등/비례) 금액" → 명단 → **기존 MerkleDrop 재사용**.
즉 **컨트랙트 변경 0**. 명단 산출만 자동화하면 끝.

### 구현 단계 (난이도순)

**2A-1) Dune 수동 (이미 설계됨, 즉시 가능)**
- 마법사가 입력(토큰주소·블록·최소수량·균등/비례) → **Dune SQL 생성** → 운영자가 Dune 실행→CSV 내보내기→업로드.
- 인프라 0. v1 그대로. (DESIGN §5.2 반영됨)
- 작업: 프론트 "Dune 쿼리 생성기"(W21에 포함). **추가 백엔드 없음.**

**2A-2) 인덱서 자동화 (다음 단계, 백엔드 필요)**
- 운영자가 "토큰+블록+조건"만 입력 → **플랫폼이 명단을 자동 산출** (Dune도 운영자 작업 불필요).
- 데이터 소스 3택:
  | 방법 | 구현 | 비용/운영 |
  |------|------|----------|
  | **(a) Dune API** | Dune 쿼리를 API로 호출, 결과 fetch | Dune 유료 API. 코드 적음 ★추천 시작점 |
  | (b) The Graph 서브그래프 | 토큰 Transfer 인덱싱 서브그래프 배포 | 직접 운영, 토큰별 |
  | (c) 직접 RPC 스캔 | Transfer 로그 긁어 잔액 계산(아카이브 노드) | 노드/Alchemy, 무거움 |
- 아키텍처:
  ```
  마법사 → POST /api/snapshot {token, block, minAmount, mode}
    → 백엔드 잡: Dune API(a) 실행 → (address, balance)[] 
    → 균등이면 고정금액, 비례면 총량×bal/Σbal
    → packages/merkle buildDrop → root + proofs.json
    → IPFS 업로드 → CID
    → 마법사에 root·총량·CID 반환
  → 운영자 createDrop(root, ...)
  ```
- 신규 컴포넌트: **`apps/api`(또는 서버리스 함수)** + Dune API 키 + 잡 큐(대용량은 비동기).
- 작업 분해:
  - SNAP-1: `/api/snapshot` 엔드포인트 + Dune API 어댑터 (백엔드)
  - SNAP-2: 균등/비례 금액 산정 로직 (packages/merkle에 헬퍼 추가)
  - SNAP-3: 마법사 UI — 조건 빌더(토큰·블록·최소수량·AND/OR·균등/비례) + 진행률 + 미리보기
  - SNAP-4: 비동기 잡(대량 명단) + 상태 폴링
- 컨트랙트 변경: **없음** (여전히 MerkleDrop).

### 2A 구현 계획 (마일스톤)
```
S1 (지금~v1):  2A-1 Dune 수동 생성기 (프론트만) — W21
S2 (post-v1):  2A-2(a) Dune API 자동화 — apps/api + SNAP-1~4
S3 (확장):     2A-2(b/c) 자체 인덱서 (Dune 비용/한계 시)
```

---

## 2B — 실시간 온체인 검증 (GatedDrop) ★ 가장 무거움, 별도 컨트랙트

### 2A와 뭐가 다른가
- 2A: **사전 명단 확정**(스냅샷) → MerkleDrop. 명단 밖이면 못 받음.
- 2B: **명단 없음.** "기간 내에 claim 시점의 온체인 상태가 조건 충족"이면 누구나. 진행 중 새로 조건 맞춘 지갑도 참여.

### 왜 별도 컨트랙트
MerkleDrop는 proof로 "명단에 있음"을 검증. GatedDrop는 **claim 시 컨트랙트가 직접 온체인 상태를 읽어** 조건 검증 → proof·root 없음. 로직이 근본적으로 다름.

### GatedDrop 컨트랙트 설계
```solidity
contract GatedDrop {
    // 불변: factory, token, startTime, deadline, identityRegistry, operator
    // 규칙(ruleConfig): 조건 인코딩
    struct Rule {
        address targetToken;     // 검사 대상(예: TON, sWTON, NFT)
        uint256 minBalance;      // ≥ 임계값
        uint8   kind;            // ERC20_BALANCE / ERC721_OWNS / STAKE_OF / ...
        // 복합 AND/OR는 Rule[] + 연산자, 또는 외부 검증 컨트랙트 주소
    }
    Rule[] rules; uint8 combineMode; // AND / OR

    // 배분량: 고정 or 보유량 비례(상한 필요)
    uint256 fixedAmount;       // 고정 배분
    // (비례는 claim 시점 보유량 읽어 산정 — 상한·총량 소진 관리 복잡)

    function claim() external {
        require(now ∈ [startTime, deadline]);
        require(identityRegistry.verifiedUntil(msg.sender) >= now);   // 게이트2
        require(!claimed[msg.sender]);                                 // 1인 1회
        require(_checkRules(msg.sender));   // ★ claim 시점 온체인 상태 직접 검증
        claimed[msg.sender] = true;
        uint256 amount = _amountFor(msg.sender);   // 고정 or 비례(상한)
        require(distributed + amount <= totalAmount);  // 총량 소진 방지
        distributed += amount;
        token.safeTransfer(msg.sender, amount);
    }
    function _checkRules(address who) internal view returns (bool) {
        // kind별: IERC20(target).balanceOf(who) >= min,
        //         IERC721(target).balanceOf(who) > 0,
        //         IStaking(target).stakedOf(who) >= min …
        // combineMode로 AND/OR 집계
    }
}
```

### 2B의 어려운 점 (설계 리스크)
| 이슈 | 대응 |
|------|------|
| **총량 분배 공정성** | 명단이 없어 "몇 명이 올지" 모름 → 선착순 소진/per-claim 상한/총량 캡 필요. fixedAmount + 총량캡이 가장 단순 |
| **비례 배분** | claim 시점 보유량 비례는 "전체 Σ"를 모름(미래 claim) → 사전 풀 한도 + 1인 상한으로 근사. 진짜 비례는 스냅샷(2A)이 적합 |
| **시빌/플래시** | claim 직전 토큰 빌려 조건 충족 후 반환(플래시론) → minBalance를 "claim 시점"만 보면 취약. **신원게이트(1인1검증)가 1차 방어**, + 필요시 "N블록 평균/스테이킹" 같은 조작난이도↑ 조건 |
| **가스** | claim마다 외부 staticcall 여러 번 → claim 가스↑. 규칙 수 제한 |
| **임의 target 컨트랙트** | 운영자가 악성 target 지정 가능 → view-only staticcall + 가스 제한 + reentrancy 무관(view) |

### GatedDrop 구현 계획
```
G1: GatedDrop.sol — Rule struct, _checkRules(ERC20/ERC721/STAKE), claim, 총량캡, 게이트2
G2: DropFactory.createGatedDrop(ruleConfig, ...) — 동일 수수료/예치/게이트1 + GatedDrop 배포
G3: 테스트 — 조건 통과/실패, 총량 소진, 플래시론 시나리오(신원게이트로 방어 확인), 다중 규칙 AND/OR
G4: SDK — GatedDrop ABI, checkEligibility read(off-chain 미리 조건 확인), buildGatedClaim
G5: 프론트 — 마법사 조건 빌더(target·min·kind·AND/OR) + 상세에서 "내 조건 충족?" 실시간 표시 + claim
G6: 보안 — 플래시론/시빌/가스 감사
```
→ **별도 컨트랙트 + 팩토리 확장 + SDK + 프론트 + 보안.** 분량 큼 = 독립 마일스톤(M-Gated).

---

# 자격 3 — 소셜·활동 기반 (퀘스트)

"트위터 팔로우 / 디스코드 가입 / 특정 트윗 RT / 온체인 활동(스왑·예치) 완료자". Galxe/Layer3 스타일.

## 핵심: 오프체인 검증 → 명단 → MerkleDrop (컨트랙트 변경 0)
2A와 같은 패턴. 다른 건 "조건 = 소셜/활동 완료"이고, 그걸 **백엔드가 OAuth·API로 검증**한다는 점.

## 아키텍처
```
고객: 캠페인 페이지 → 퀘스트 목록 → 각 태스크 "완료하기"
  · 트위터 팔로우 → OAuth로 본인 계정 인증 → API로 팔로우 여부 확인
  · 디스코드 가입 → OAuth → 길드 멤버 확인
  · 온체인 활동 → 지갑 연결 → 인덱서로 tx 확인
  → 백엔드가 태스크별 완료 기록 (지갑 ↔ 소셜계정 매핑)

운영자: 마감 → 백엔드가 "모든 필수 태스크 완료한 지갑" 집계
  → (address, amount) 명단 → buildDrop → root + proofs → IPFS
  → createDrop

고객: 클레임 페이지 → proof로 claim (기존 MerkleDrop)
```

## 필요 컴포넌트 (신규)
| 컴포넌트 | 역할 |
|----------|------|
| **apps/api (백엔드)** | OAuth 흐름, 태스크 검증, 완료 기록 DB |
| **OAuth 통합** | Twitter/X API v2, Discord OAuth2 |
| **DB** | quest_completion(campaign, wallet, task, verified_at), wallet↔social 매핑 |
| **Sybil 방지** | 1 소셜계정 1지갑, 계정 나이/팔로워 임계, 신원게이트(1인1검증)와 결합 |
| 인덱서 | 온체인 활동 태스크 확인 (2A 인프라 재사용) |

## 어려운 점
| 이슈 | 대응 |
|------|------|
| **Sybil** (봇이 가짜 계정 대량) | 신원게이트(zk-X509 1인1검증)가 **강력한 1차 방어** — 이게 우리 차별점. + 소셜계정 임계 |
| **API 비용/레이트리밋** | Twitter API 유료·제한 심함. 캐싱·배치 검증 |
| **소셜계정↔지갑 매핑 프라이버시** | 최소 저장, 해시, 동의 |
| **태스크 위조** | 서버측 검증만 신뢰(클라 신뢰 금지), 재검증 |
| **플랫폼 의존** | 트위터 API 정책 변동 리스크 |

## 구현 계획
```
SOC-1: apps/api 부트스트랩 + DB 스키마 (quest_completion, wallet_social)
SOC-2: OAuth — Discord(쉬움) 먼저 → Twitter/X(어려움)
SOC-3: 태스크 검증기 (follow/join/onchain-activity) — 서버측
SOC-4: Sybil 정책 (소셜계정 1지갑 + 신원게이트 결합)
SOC-5: 마법사 — 퀘스트 설정(태스크 추가/필수여부) + 고객 퀘스트 UI
SOC-6: 마감 집계 → 명단 → buildDrop → createDrop 연결
SOC-7: 보안/남용 (레이트리밋, 재검증, 매핑 프라이버시)
```
→ **백엔드+OAuth+DB+sybil = 가장 무거운 서브시스템** (DESIGN §10에서도 일정영향 큼으로 분류). 독립 마일스톤(M-Social).

---

# 종합: 난이도·순서

| 방식 | 컨트랙트 변경 | 백엔드 | 난이도 | 권장 시점 |
|------|:---:|:---:|:---:|------|
| 1 CSV→Merkle | — | — | ✅완료 | done |
| 2A-1 스냅샷(Dune 수동) | 없음 | 없음 | 낮음 | **v1 (W21)** |
| 2A-2 스냅샷(인덱서 자동) | 없음 | Dune API/인덱서 | 중 | post-v1 우선 |
| 3 소셜·활동 | 없음 | **풀백엔드+OAuth+DB** | 높음 | post-v1 |
| 2B GatedDrop(실시간) | **별도 컨트랙트** | 없음 | 높음 | post-v1 |

## 권장 개발 순서 (post-v1)
```
1) 2A-2(a) Dune API 자동화   — 백엔드 첫 도입, 명단 자동화. ROI 높음
2) 2B GatedDrop              — 컨트랙트 확장(백엔드 불필요). "기간 내 조건충족" 신규 UX
   또는
2') 3 소셜                   — 2A 백엔드(apps/api) 인프라 재사용해 확장
3) 나머지(베스팅/선착순/가스리스/멀티체인)
```

## 공통 선결 (셋 다 영향)
- **apps/api 백엔드 도입 결정** — 2A-2·3은 백엔드 필수. 한 번 만들면 둘 다 씀. (스택: Next API routes / 별도 Node / 서버리스)
- **proof 저장(IPFS, §8.7)** — 셋 다 명단→proofs.json 산출하므로 B1과 함께
- **신원게이트 = 공통 sybil 방어** — 우리 차별점, 셋 다 활용
