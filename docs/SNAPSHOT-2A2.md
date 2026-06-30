# 2A-2 — Dune API 스냅샷 자동화 (구현 계획)

> ⚠️ **상태: 보류 (수요·과금모델 확정 후 착수).** Dune API는 무료가 아니다(Plus ~$349/월+, Free엔 API 없음).
> 즉 2A-2는 **플랫폼이 처음으로 변동 운영비(Dune 구독)를 지는 기능**이다.
> - 같은 결과를 **2A-1(Dune 수동)**이 운영비 0으로 제공한다(운영자가 Dune Free로 직접 명단 뽑아 업로드).
> - 따라서 v1은 **2A-1 우선**, 2A-2는 "자동화에 돈 낼 운영자 수요"를 확인하고,
>   **snapshot 생성 수수료 ≥ Dune 원가 회수**가 성립할 때 착수.
> - 비용 정렬: `feeOf[ONCHAIN_SNAPSHOT]`(이미 종류별 차등 설계, 중간 요금)으로 Dune 원가 회수.
>   Dune 월구독 ÷ 월 snapshot 캠페인 수 ≤ snapshot 수수료여야 흑자.
> 아래 설계/작업분해는 **착수 시점에 그대로 사용**하기 위한 보존본.


목표: 운영자가 마법사에 **"토큰주소 · 스냅샷블록 · 최소수량 · 균등/비례"**만 입력하면,
플랫폼이 **Dune API로 명단을 자동 산출** → `(address, amount)` → merkle root + proofs → createDrop.
(2A-1 Dune 수동 = 운영자가 직접 Dune 실행. 2A-2 = 그 단계를 서버가 대신)

## 스택 결정 (확정)
- **백엔드 = Next.js Route Handlers** (`apps/web/src/app/api/**`). 별도 서비스 안 띄움 — `dev-fork` + `web`만으로 동작.
- **Dune API 키 = 서버 전용** (`DUNE_API_KEY`, **NEXT_PUBLIC 아님**) — 클라이언트 노출 금지.
- 나중에 부하 커지면 별도 `apps/api`(Node/서버리스)로 분리 (인터페이스 동일하게 설계).
- 명단 산출·merkle은 `packages/merkle`(buildDrop) 재사용. proofs 저장은 B1(IPFS)과 합류, v1 단계는 메모리/응답 반환.

## 데이터 흐름
```
[마법사] 조건 입력(token, block, minBalance, mode=equal|pro-rata, perWalletAmount? totalAmount?)
   │  POST /api/snapshot
   ▼
[Route Handler /api/snapshot]
   1. 입력검증(주소·블록·금액)
   2. Dune 쿼리 실행: "block N 시점 token 잔액 ≥ minBalance 인 (address, balance)"
        - Dune API: execute query (parameterized) → poll status → fetch results
   3. 금액 산정:
        - equal:    각자 perWalletAmount  (총량 = N × perWalletAmount)
        - pro-rata: 각자 totalAmount × balance / Σbalance  (정수 나눗셈 + 잔여 처리)
   4. packages/merkle buildDrop((address, amount)[]) → { merkleRoot, totalAmount, count, claims }
   5. 응답: { merkleRoot, totalAmount, count, recipients[], proofs }   (+ 후속: IPFS CID)
   ▼
[마법사] 미리보기(인원·총량) → 운영자 createDrop(root, totalAmount, ...)
[클레임] proofs로 claim (기존 MerkleDrop, 변경 0)
```

## 컨트랙트 변경
**없음.** 기존 MerkleDrop + createDrop(type=ONCHAIN_SNAPSHOT) 그대로.

## 작업 분해

### SNAP-1 — Dune 어댑터 (라이브러리, 담당 S/K0)
- `packages/snapshot/`(신규) 또는 `packages/sdk/src/snapshot/`:
  - `runHolderSnapshot({duneApiKey, token, block, minBalance}): Promise<{address, balance: bigint}[]>`
  - Dune API v1: `POST /v1/query/{id}/execute` → `GET /execution/{id}/status`(poll) → `GET /execution/{id}/results`.
  - 파라미터라이즈드 쿼리(고정 query_id, 파라미터 token/block/min) 또는 SQL 직접.
  - 재시도·타임아웃·페이지네이션(대량 결과). bigint 파싱(잔액 정밀도).
- 테스트: Dune 응답 mock으로 파싱·페이지네이션·에러.
- **선결: Dune 계정 + query 작성 + API 키** (사용자/K0). query_id를 env로.

### SNAP-2 — 금액 산정 (packages/merkle, 담당 S/K0)
- `allocateEqual(holders, perWallet)` → `(address, amount)[]`
- `allocateProRata(holders, totalAmount)` → 정수 비례 + **잔여(rounding dust) 처리**(최대 보유자에 가산 or 버림 명시) + 0-amount 제거.
- 테스트: 합계 = 총량, dust 없음, 경계(1명·동일잔액).

### SNAP-3 — API Route (apps/web, 담당 F/K3 + S 협업)
- `apps/web/src/app/api/snapshot/route.ts` (POST):
  - zod 입력검증, runHolderSnapshot → allocate → buildDrop → 응답.
  - 에러 처리(Dune 실패·빈 명단·잘못된 토큰). 레이트리밋(간단).
  - **대량은 비동기**: 1차는 동기(소규모), 후속 job+polling(SNAP-6).
- 보안: DUNE_API_KEY 서버에서만, 응답에 키 노출 없음, CSV injection 무관(JSON).

### SNAP-4 — 마법사 UI (apps/web, 담당 F/K3)
- Step2 "규칙: 스냅샷" 선택 시 조건 빌더:
  - 토큰 주소(또는 등록토큰 picker) · 스냅샷 블록(또는 날짜→블록) · 최소수량 · 균등(perWallet)/비례(totalAmount)
  - "명단 산출" 버튼 → /api/snapshot 호출 → 진행률 → 미리보기(인원·총량·상위 일부)
  - 결과 root·총량을 createDrop으로 연결 (기존 가이드 플로우와 합류)
- 결과 CSV 내보내기(검토용) 옵션.

### SNAP-5 — 단순 복합조건 (선택, 후속)
- AND/OR 다중 토큰(예: TON≥100 AND NFT 보유) — Dune 쿼리 확장 or 여러 스냅샷 교집합/합집합.
- v1 자동화는 단일 조건부터. 복합은 SNAP-5.

### SNAP-6 — 비동기 잡 (대량, 후속)
- 수만 홀더면 Dune 실행 수십 초~분 → job 큐 + 상태 폴링 + 캐시(같은 token/block 재사용).

## 마일스톤
```
M-Snap-1 (코어):  SNAP-1 Dune어댑터 + SNAP-2 금액산정 + 테스트 (라이브러리, 백엔드 무관 단위테스트)
M-Snap-2 (API):   SNAP-3 route + 선결(Dune query/키)
M-Snap-3 (UI):    SNAP-4 마법사 스냅샷 빌더 → end-to-end
M-Snap-4 (확장):  SNAP-5 복합조건 / SNAP-6 비동기
```

## 선결 결정 (사용자/K0)
1. **Dune 계정·API 키·query 작성** — 누가 Dune query를 만들고 query_id/키를 줄지. (없으면 K0가 query 템플릿 작성, 키는 사용자 발급)
2. **proofs 저장** — v1 자동화는 응답으로 proofs 반환(프론트 보관) vs 바로 IPFS(B1) 합류. 1차는 응답반환, B1 머지 시 IPFS.
3. **비례 배분 dust 정책** — 최대 보유자 가산 vs 버림. (기본: 버림 + 총량은 실제 합으로)

## 리스크
- Dune API 유료·레이트리밋 → 캐시·동일쿼리 재사용.
- 큰 명단 = 느림 → 비동기(SNAP-6).
- 스냅샷 블록의 정확성(파이널리티) → 충분히 과거 블록 권장.
