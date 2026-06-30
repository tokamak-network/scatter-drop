# scatter-drop — 프론트엔드 메뉴 구성 (IA)

`docs/DESIGN.md` 기반.

## 설계 원칙 (먼저 합의한 전제)

1. **모드/역할 선택 없음.** 입장 시 "운영자냐 고객이냐"를 고르지 않는다.
   한 지갑이 운영자이면서 동시에 고객일 수 있으므로, 신분으로 나누지 않고
   **활동(맥락)**으로만 구분한다. 메뉴는 누구에게나 동일하게 노출되고,
   해당 지갑에 데이터가 있는 메뉴만 내용이 찬다.
2. **Explore = 전체 공개 디렉토리.** 받을 게 없어도, 지갑을 연결 안 해도
   진행 중인 모든 캠페인을 조회할 수 있다. (개인화 아님)
3. **자격은 캠페인 상세에서 그 자리에서 판정.** `My Claims`에 없어도 클레임 가능.
   특히 온체인 검증형(GatedDrop)은 사전 명단이 없고, **둘러보다 자격을 획득**한다.
4. **My Claims = 보조.** 사전 확정된 자격(Merkle 명단)의 단축 목록일 뿐,
   클레임의 필수 진입점이 아니다.
5. **어드민만 진짜 권한 분기.** 플랫폼 어드민(`/admin`)만 컨트랙트 권한으로 게이팅.
6. **모든 캠페인은 zk-X509 CA 레지스트리를 필수 지정한다.** (아래 §0)

---

## 0. zk-X509 신원 게이트 — 2종 (모두 필수)

(연동: `/Users/zena/tokamak-projects/zk-X509` — RegistryFactory / IdentityRegistry)

신원검증은 **두 종류**다. 서로 **다른 CA 레지스트리**를 쓴다.

| | (1) 운영자 게이트 | (2) 고객 게이트 |
|---|---|---|
| 대상 | 캠페인 **만드는** 지갑 | 에어드랍 **받는** 지갑 |
| CA 레지스트리 | **전역 1개**(운영자용) | **캠페인마다** 운영자 지정 |
| 등록 주체 | **플랫폼 어드민** | 운영자(생성 시 선택) |
| 강제 시점 | 캠페인 생성(`createDrop`) | 클레임(`claim`) |
| 판정 | `operatorRegistry.verifiedUntil(me) ≥ now` | `campaign.identityRegistry.verifiedUntil(me) ≥ now` |

### (1) 운영자 게이트 — 캠페인 만들려면 신원검증 필수
- 어드민이 전역 설정한 **운영자용 레지스트리**에서 신원검증된 지갑만 캠페인 생성 가능.
- `Manage`에서 `+ New Campaign` 진입 시 **선 신원검증 확인** → 미검증이면 zk-X509 등록 유도, 생성 차단.

### (2) 고객 게이트 — 받으려면 신원검증 필수 (캠페인마다)
- 캠페인 생성 시 **고객용 IdentityRegistry 주소를 필수 지정**(아래 입력 UX).
- **불변 규칙(예외 없음):** 받는 지갑은 반드시 그 레지스트리에서 사전 신원검증된 지갑.
  미검증 지갑은 절대 수령 불가.
- **수령=검증 지갑 동일:** self-claim만 허용. `msg.sender`가 곧 검증 대상. 대납·타주소 수령 불가.

### 공통
- **목적:** Sybil 방지 / 실명·소속 기반 자격.
- **자격 방식과 직교:** CSV·규칙·소셜 자격 위에 **항상 겹쳐지는 신원 게이트**.
  - claim 조건 = `(자격 충족)` **AND** `(수령 지갑이 고객 레지스트리 검증됨)`
  - create 조건 = `(운영자 지갑이 운영자 레지스트리 검증됨)`

### 재사용 — 국가수준 "기본 금융 신원" 표준 레지스트리 (verify-once → claim-many)
- 국가수준 신원(한국 NPKI·정부 eID 등) = **기본 금융 신원 확인(은행권 KYC 수준)**.
  플랫폼이 국가별 **정준 레지스트리**(예: `KR-NPKI`, `EE-eID`)를 등록해두고 운영자가 선택.
- 사용자는 그 레지스트리에 **한 번만 신원검증** → 그 레지스트리를 쓰는 **모든 캠페인에서 재검증 없이** 참여.
  → 캠페인 상세의 IdentityGate가 이미 검증된 지갑이면 바로 통과(추가 등록 화면 안 뜸).

### 고객용 레지스트리 입력 UX (생성 마법사 Step 1, 필수)
```
zk-X509 고객 CA Registry  *필수
 ○ 표준(추천)        플랫폼 큐레이션 국가 레지스트리에서 선택
                     예: KR-NPKI(기본 금융 신원) · EE-eID …  ← 대부분 이걸 재사용
 ○ 레지스트리 선택   RegistryFactory.registries[] 전체 목록 조회
                     (이름·신뢰 CA 수·소유자·생성일 표시)
 ○ 주소 직접 입력    0x… (factory.isRegistry[addr] == true 검증)
 └ 미선택 시 다음 단계 진행 불가 (validation 차단)
```
- 표준 레지스트리 우선 노출 → 운영자는 보통 **새로 만들지 않고 재사용**.
- 선택 레지스트리 메타(이름·CA 규모·소유자) 카드 미리보기.
- factory 정식 레지스트리 아니면 에러. (커스텀이 필요하면 zk-X509로 새로 만들기 링크)
- (운영자용 레지스트리는 어드민이 §4에서 전역 설정 — 운영자가 고르지 않음)

---

## 1. 글로벌 메뉴 (모든 지갑 동일)

연결 여부와 무관하게 메뉴 자체는 항상 보인다. 지갑이 필요한 동작에서만 연결을 유도한다.

```
Explore       /campaigns      전체 캠페인 디렉토리 (공개, 지갑 불필요)
My Claims     /claim          내 사전확정 자격 단축 목록 (연결 시)
Manage        /manage         내가 만든 캠페인 + 새로 만들기 (연결 시)
─────────────────────────────
[Connect Wallet]              우측 상단 고정
```

- `Home(/)` 은 Explore로 바로 보내거나 가벼운 랜딩 + CTA(둘러보기 / 캠페인 만들기).
- `My Claims`·`Manage` 는 **메뉴엔 항상 있고**, 내용이 없으면 EmptyState로 안내
  (받을 게 없음 → "Explore에서 둘러보세요" / 만든 게 없음 → "+ 캠페인 만들기").
- 별도 "운영자 가입"·"모드 전환" 단계 없음.

---

## 2. Explore (`/campaigns`) — 발견 경로

- 진행 중인 **모든** 캠페인 카드 (검색·필터·정렬). 지갑·자격과 무관.
- 카드 클릭 → 캠페인 상세(`/c/[id]`).

### 2.1 캠페인 상세 / 클레임 (`/c/[id]`) — 클레임의 본질적 진입점
모든 클레임은 여기서 일어난다. (My Claims는 여기로 가는 지름길일 뿐)

```
캠페인 브랜딩(이름·로고·설명)
진행 정보(총량·클레임률·마감일/claim window·예치 증명)
─ 신원 게이트(필수) ─  지정된 zk-X509 CA Registry 검증
  · verifiedUntil(claimer) >= now ?  → 미검증이면 "신원 인증 필요" 안내
    (zk-X509에서 X.509 인증서로 등록하는 흐름으로 유도)
─ 내 자격 확인 ─  ← 지갑 연결 시 그 자리에서 판정
  · Merkle형(CSV·스냅샷·소셜): proof 조회 → eligible / already claimed
  · 온체인 검증형(GatedDrop) : 지갑 상태 실시간 검증 → 조건 충족 시 eligible
[Claim]  조건 = (신원검증됨) AND (자격 충족) → 배포 방식별 분기: 즉시 / 베스팅 / 선착순
```

> 핵심: `My Claims`에 안 떠도, 둘러보다 여기서 자격을 확인·획득해 클레임할 수 있다.
> 단, **CA 레지스트리 신원검증은 모든 캠페인의 선행 조건**이다.

### 2.2 My Claims (`/claim`) — 보조 단축 목록
- 사전 확정된(Merkle) 자격만 모아 보여줌. 비어 있을 수 있음(정상).
- 각 항목 → 캠페인 상세의 claim으로 연결.

---

## 3. Manage (`/manage`) — 운영 활동 (별도 신분 아님)

연결된 지갑이 **만든** 캠페인을 다룬다. 캠페인을 한 번도 안 만들었으면 비어 있고,
만드는 순간 항목이 생긴다. (운영자 "됨"이라는 전환 없음 — 셀프서비스)

```
Manage            /manage         내가 만든 캠페인 목록(상태·클레임률·잔여)
+ New Campaign    /manage/new      생성 마법사 (운영자 신원검증 선행 — §0-1)
Campaign 관리     /manage/[id]     (본인이 createDrop한 캠페인만)
 ├ Overview       핵심 KPI 요약(클레임률·잔여·참여자 수·예치 증명)
 ├ Participants   ★ 에어드랍 참여자 통계 (운영자 필수 화면)
 │   ├ 참여자 수: 자격자 / 신원검증 완료 / 실제 클레임 / 미클레임
 │   ├ 클레임률·전환율, 시간대별 클레임 추이(그래프)
 │   ├ 분포: 배분량 구간별·국가/소속(고객 CA 선택공개 시)·신규vs기존
 │   └ 참여자 리스트(주소·amount·claimed·검증상태) + CSV 내보내기
 ├ Proofs         proofs.json 다운로드·배포(IPFS/S3)
 ├ Settings       마감일 등
 └ Sweep          마감 후 잔여 회수
```
> ★ 운영자는 자신의 캠페인 **참여자 통계**를 볼 수 있어야 한다(참여자 수·클레임률·추이·분포).
>   단, 개인정보는 노출 안 됨 — 고객 CA의 **선택적 공개(국가·소속)** 범위 내에서만 집계.

> **운영자 신원 게이트:** `+ New Campaign` 진입 시 운영자용 레지스트리 검증 확인.
> 미검증이면 마법사 진입 전에 zk-X509 신원검증 등록으로 유도(생성 차단).

### 3.1 생성 마법사 (`/manage/new`) — DESIGN §6
```
Step 0  운영자 신원검증  operatorRegistry.verifiedUntil(me) ≥ now 확인 (미검증 시 차단)
Step 1  기본 정보   이름·설명·로고·배포 토큰·총량·마감일
                  · 배포 토큰: 등록부 picker (OFFICIAL 먼저 → COMMUNITY). 없으면 "+ 토큰 추가"(addAllowedToken)
                  + zk-X509 고객 CA Registry *필수 (§0-2 — 수령자 신원 게이트)
Step 2  자격 방식   ○ CSV 업로드                      → type=CSV
                    ○ 규칙: 스냅샷                     → type=ONCHAIN_SNAPSHOT
                    ○ 규칙: 온체인 검증(GatedDrop)     → type=ONCHAIN_GATED
                    ○ 소셜·태스크                      → type=SOCIAL  [3단계]
   · 선택 즉시 해당 종류의 **생성 수수료(feeOf[type])를 표시** (종류마다 다름)
   └ CSV  → (address, amount) 업로드 + 검증
   └ 규칙 → 조건 빌더(보유≥N, 스테이킹≥X, NFT, AND/OR) + 스냅샷/실시간
   └ 소셜 → 퀘스트 설정(트위터/디스코드)
Step 3  배포 방식   ○ 즉시  ○ 베스팅(cliff+linear)  ○ 선착순
Step 4  미리보기    자격자 수·총 배분량 → Merkle 트리 생성
                    + 결제 요약: 종류별 수수료(feeOf[type]) + 예치 토큰량
Step 5  생성 & 결제 납부 토큰 선택(ETH / TON …) — 토큰별 가격 표시(TON 할인)
                    선택 토큰의 feeOf[token][type] 지불(ETH=msg.value/ERC20=approve) + 배포 토큰 예치 → createDrop
```
> v1 핵심 경로: **CSV → Merkle → 즉시 배포.** 나머지는 단계적 노출.
> 수수료는 **선택한 자격 방식(종류)에 따라 달라짐** — Step 2에서 즉시 안내.

---

## 4. Admin / 플랫폼 어드민 페르소나 (`/admin`) — 유일한 권한 분기

플랫폼 어드민 = DropFactory 권한을 가진 지갑. 그 지갑일 때만 `/admin` 메뉴 노출(아니면 숨김).
역할: **(a) 수수료·자금 정책, (b) 운영자 신원 게이트(operatorRegistry), (c) 전체 캠페인 모니터링.**
DESIGN §7·§8·§4.3.

```
Overview          /admin            플랫폼 현황 대시보드
 ├ 현재 등록 캠페인 수 (total / active / ended)
 ├ 누적 수수료·트레저리 잔액
 └ 운영자 수·클레임 총량 등 핵심 지표

Campaign Funds    /admin/funds      ★ 생성 수수료 설정 — (납부토큰 × 종류) 2차원
 ├ 납부 토큰 행     ETH(address(0)) / TON / … — 토큰별로 가격 행 추가
 ├ feeOf[token][type] ★ setFee(token,type,amount) — 토큰별·종류별 금액 (TON 할인 = TON 행을 낮게)
 │            ┌ CSV ┬ SNAPSHOT ┬ GATED ┬ SOCIAL
 │      ETH   │  저 │   중      │  중상 │  고
 │      TON   │ 저↓ │  중↓     │  …    │  … (할인)
 └ (0 = 그 (토큰,종류) 미허용. 운영자는 생성 시 납부토큰 선택→해당 금액 볼트 적립)

Identity Registries /admin/identity ★ 신원 레지스트리 관리
 ├ Operator Gate   운영자용 CA 레지스트리(operatorRegistry) 등록·변경
 │   ├ 현재 operatorRegistry 주소·메타(신뢰 CA 수·소유자)
 │   └ setOperatorRegistry(addr)  — 운영자 신원검증 기준 (§0-1)
 └ Standard(고객) 큐레이션 — 국가수준 "기본 금융 신원" 표준 레지스트리 목록 관리
     ├ KR-NPKI / EE-eID … 추가·삭제 (운영자 마법사에서 추천 노출)
     └ 운영자가 verify-once로 재사용하도록 정준 레지스트리 제공

Tokens            /admin/tokens     ★ 에어드랍 토큰 등록부 (§8.7)
 ├ OFFICIAL 지정/해제  setOfficialToken — 공식 토큰(목록 상단)
 ├ COMMUNITY 목록      운영자가 addAllowedToken으로 추가한 토큰
 └ Remove             removeAllowedToken — 악성/사칭 사후 제거

Fee Vault         /admin/vault      ★ 캠페인 생성 자금(수수료) 볼트
 ├ 적립 잔액       collectedFees(token) — 토큰별 누적 잔액 조회
 ├ 입출금 내역     생성 수수료 유입·출금 히스토리
 └ [Withdraw]      withdrawFees(token, to, amount) — 플랫폼 어드민만 출금

Campaigns (All)   /admin/campaigns  ★ 전체 캠페인 목록 + 개수
 └ Campaign 상세  /admin/campaigns/[id]   각 캠페인별 어드민 대시보드
     ├ 기본 정보·운영자·고객 CA 레지스트리
     ├ 클레임률·잔여·참여자·예치/수수료 내역
     └ (모니터링 전용 — 운영 권한은 운영자 본인에게)

Whitelist         /admin/whitelist  수수료 면제 (미결정 §12)
Access            /admin/access     타임락·멀티시그 (7단계)
```

> ★ = 사용자가 명시 요청한 항목: 요구 자금(토큰·금액) 설정 / 운영자 CA 등록 /
>     현재 캠페인 등록 개수 / 각 캠페인별 대시보드 / **수수료 볼트 조회·출금(어드민)**.

---

## 5. 노출 규칙 요약 (신분이 아니라 상태 기준)

| 메뉴 | 노출 조건 | 비었을 때 |
|------|-----------|-----------|
| Explore / 캠페인 상세 | 항상 (지갑 불필요) | 플랫폼에 캠페인 없을 때만 빔 |
| My Claims | 항상 노출, 내용은 연결 시 | "받을 것 없음 → Explore" |
| Manage | 항상 노출, 내용은 연결 시 | "+ 캠페인 만들기" |
| 캠페인 관리 상세 | 본인이 만든 캠페인만 접근 | — |
| Admin | 어드민 권한 지갑만 메뉴 노출 | — |

→ **판별이 필요한 건 단 둘**: (a) 캠페인 관리 상세의 소유권(=createDrop 주체), (b) 어드민 권한.
   그 외엔 "운영자/고객" 구분 자체가 없다.

---

## 6. 우선순위 (Build Order 매핑)

| 메뉴/화면 | DESIGN 단계 | v1 |
|-----------|------------|----|
| 캠페인 상세 클레임 + `/manage/new`(CSV) + 관리 Overview/Sweep | 1·2 | **P0** |
| 신원 게이트 2종(운영자=어드민 등록 / 고객=캠페인 지정) | 1 | **P0** |
| 운영자 Participants(참여자 통계) | 2 | **P0** |
| Admin: Funds·Operator Gate·캠페인 수·캠페인별 대시보드 | 2 | **P0** |
| Explore, My Claims | 2 | P1 |
| 마법사 규칙/소셜 자격, GatedDrop 상세(온체인 검증 UI) | 3 | P2 |
| 배포 방식 베스팅/선착순 UI | 4 | P2 |
| 클레임 페이지 브랜딩·알림 | 5 | P3 |
| 가스리스·멀티체인 셀렉터 | 6 | P3 |
| Admin 권한·타임락 UI | 7 | 상시 |

---

## 7. 공통 컴포넌트
- **WalletConnect** — 상단 고정 (wagmi/viem). 동작 시점에만 연결 유도.
- **NetworkBanner** — L1 메인넷 고정 (멀티체인은 6단계).
- **CARegistryPicker** — 생성 시 zk-X509 IdentityRegistry 선택/검증(필수 입력).
- **IdentityGate** — 캠페인 상세에서 `verifiedUntil(claimer)` 확인, 미검증 시 등록 유도.
- **EligibilityCheck** — 캠페인 상세에서 Merkle proof / 온체인 상태 판정 공용.
- **TxStatus / Toast** — createDrop·claim·sweep 상태.
- **EmptyState / Loading / Error** — My Claims·Manage 빈 상태 포함.

---

### 최소 v1 메뉴 (요약)
글로벌: `Explore` · `My Claims` · `Manage`  (모드 선택 없음, 모두 동일 노출)
관리:   `New Campaign(운영자 신원검증 + CSV + 고객 CA Registry 필수)`
        `Campaign 관리(Overview / Participants 통계 / Sweep)`  (본인 캠페인만)
어드민: `Overview(캠페인 수)` · `Campaign Funds(토큰·종류별 수수료)` · `Operator Gate(운영자 CA)`
        `Fee Vault(잔액 조회 + 출금)` · `Campaigns(All) + 캠페인별 대시보드`  (권한 지갑만)
