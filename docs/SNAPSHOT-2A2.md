# 2A-2 — Dune API 스냅샷 자동화 (구현 계획)

> ✅ **상태: 착수 (백엔드 + Alchemy RPC 스캔). Dune 안 씀.**
> **결정: Dune API($349/월) 대신 Alchemy RPC 스캔(무료티어, 아카이브 포함)으로 백엔드에서 명단 산출.**
> - 운영비 0 (이미 보유한 Alchemy 무료티어 = 월 3억 CU). snapshot 수수료는 종류별 차등으로 유지(Dune 원가회수 불필요).
> - **백엔드인 이유 = 비용이 아니라 키 보호 + 남용 방지.** 우리 Alchemy 키는 서버에만(NEXT_PUBLIC 아님),
>   운영자는 입력만(키 몰라도 됨), 레이트리밋으로 봇 남용 차단.
> - 백엔드 = Next.js Route Handlers(`apps/web/src/app/api/**`) — 별도 서비스 무. dev-fork+web만으로 동작.
> - 결과 명단 → 기존 packages/merkle buildDrop → root + proofs → createDrop. **컨트랙트 변경 0.**


목표: 운영자가 마법사에 **"토큰주소 · 스냅샷블록 · 최소수량 · 균등/비례"**만 입력하면,
플랫폼이 **Dune API로 명단을 자동 산출** → `(address, amount)` → merkle root + proofs → createDrop.
(2A-1 Dune 수동 = 운영자가 직접 Dune 실행. 2A-2 = 그 단계를 서버가 대신)

## 스택 결정 (확정)
- **백엔드 = Next.js Route Handlers** (`apps/web/src/app/api/**`). 별도 서비스 안 띄움 — `dev-fork` + `web`만으로 동작.
- **데이터 = Alchemy RPC 스캔 (아카이브 노드, 무료티어).** Dune 안 씀.
- **Alchemy 키 = 서버 전용** (`ALCHEMY_RPC_URL` 또는 기존 `SEPOLIA_RPC_URL` 서버측, **NEXT_PUBLIC 아님**) — 클라 노출 금지.
- **왜 백엔드 필수:** ① 특정 과거 블록 잔액(`balanceOf at block N`)은 **아카이브 노드** 필요(Alchemy 무료티어 포함) ② 우리 키를 클라에 노출하면 봇 남용으로 무료티어 소진 → 서버 보관+레이트리밋.
- 나중에 부하 커지면 별도 `apps/api`로 분리(인터페이스 동일). merkle은 `packages/merkle`(buildDrop) 재사용. proofs는 B1(IPFS) 합류 전까지 응답 반환.

## 아키텍처 (백엔드 보강)
```
                          ┌──────────── apps/web (Next.js) ────────────┐
[운영자 브라우저]          │  마법사(클라)                                │
  조건 입력 ──────────────┼─▶ POST /api/snapshot/start  (Route Handler)  │  ← 서버: Alchemy 키 보유
  진행률 폴링 ◀───────────┼─  GET  /api/snapshot/status?id=…            │
  결과 미리보기 ◀──────────┼─  GET  /api/snapshot/result?id=…            │
                          └──────────────────┬──────────────────────────┘
                                             │ packages/snapshot (서버측 RPC 스캔)
                                             ▼
                              Alchemy 아카이브 RPC (무료티어, 키=서버전용)
                                getLogs(Transfer, →blockN) → 후보주소
                                multicall balanceOf@blockN → (addr, bal)
                                             │
                                             ▼ packages/merkle allocate→buildDrop
                                 { merkleRoot, totalAmount, recipients, proofs }
                                             │
[운영자] 미리보기 OK ─▶ createDrop(root, totalAmount, ONCHAIN_SNAPSHOT, …)  (컨트랙트 변경 0)
[클레임] proofs로 claim (기존 MerkleDrop)
```

### 왜 동기 1샷이 아니라 잡(job) 구조인가
RPC 스캔은 **수초~수분**(getLogs 페이지네이션 + balanceOf 다수). HTTP 요청 1개로 끝내면 타임아웃.
→ **start(잡 생성)→status(폴링)→result** 3-엔드포인트 + 서버측 잡 상태 저장. 소규모는 거의 즉시, 대량은 진행률.

### 잡 상태 저장 (단계적)
- **v1(MVP):** 인메모리 Map(프로세스 내) — dev/단일 인스턴스 충분. 재시작 시 잡 소실(허용).
- **확장:** Redis/KV(멀티 인스턴스·영속). 인터페이스(`JobStore`)로 추상화해 교체 가능하게.

## 컨트랙트 변경
**없음.** 기존 MerkleDrop + createDrop(type=ONCHAIN_SNAPSHOT) 그대로.

## 작업 분해

### SNAP-1 — RPC 홀더 스캐너 (packages/snapshot 신규, 담당 S/K0)
서버 전용 라이브러리. viem publicClient(아카이브 RPC) 주입.
- `scanHolders({client, token, block, minBalance, onProgress?}): Promise<{address, balance: bigint}[]>`
  1. **후보 수집:** `getLogs({address: token, event: Transfer, fromBlock: 0n||deployBlock, toBlock: block})` →
     `to`(+`from`) 주소 집합. **블록범위 청크**(무료티어 getLogs 한도, 예 2k블록)로 페이지네이션 + 재시도.
  2. **잔액 확정:** 후보를 **multicall(batch) `balanceOf(addr)` at `blockTag: block`** — 배치 크기 제한(예 500),
     아카이브 노드 필수. 0 제외, `>= minBalance` 필터.
  3. bigint 정밀도 유지, onProgress(처리/전체) 콜백.
- **레이트리밋/재시도:** 429 backoff, 동시성 캡. CU 예산 가드(상한 초과 시 중단+안내).
- 테스트: getLogs/multicall mock으로 청킹·필터·진행률·에러·빈결과.
- 선결: 아카이브 RPC(Alchemy 무료티어. SEPOLIA_RPC_URL 서버측 재사용 or 별도 ALCHEMY_RPC_URL).

### SNAP-2 — 금액 산정 (packages/merkle, 담당 S/K0)
- `allocateEqual(holders, perWallet)` → `(address, amount)[]` (총량 = N × perWallet)
- `allocateProRata(holders, totalAmount)` → 정수 비례 + **dust 처리(버림 + 총량은 실제 합)** + 0-amount 제거.
- 테스트: 합계 일치, dust 없음, 경계(1명·동일잔액·minBalance 경계).

### SNAP-3 — 잡 오케스트레이션 + Route Handlers (apps/web/src/app/api, 담당 F/K3 + K0)
- `JobStore` 인터페이스(인메모리 구현) — `create/get/update/setResult`.
- `lib/snapshot/job.ts`(서버): start 시 백그라운드로 scanHolders→allocate→buildDrop, 상태/진행률 갱신.
- Routes:
  - `POST /api/snapshot/start` — zod 검증(token addr·block·minBalance·mode·금액). jobId 반환. 백그라운드 실행.
  - `GET  /api/snapshot/status?id` — { state: queued|running|done|error, progress, error? }.
  - `GET  /api/snapshot/result?id` — { merkleRoot, totalAmount, count, recipients(상위 일부+전체수), proofs }.
- **보안(보강):** Alchemy 키 **서버에서만**(절대 NEXT_PUBLIC 아님). 입력 레이트리밋(IP/세션). 잡당 CU 상한.
  token/block 검증(컨트랙트 코드 존재·block ≤ 최신·충분히 과거). 응답에 키/내부 노출 없음.
- (B1 머지 후) proofs → IPFS 업로드 → CID 응답.

### SNAP-4 — 마법사 UI (apps/web, 담당 F/K3)
- Step2 "규칙: 스냅샷":
  - 토큰(등록토큰 picker/주소) · 스냅샷 블록(또는 날짜→블록 변환) · 최소수량 · 균등(perWallet)/비례(totalAmount).
  - "명단 산출" → start → **진행률 바**(폴링) → 미리보기(인원·총량·상위 N) → createDrop 연결.
  - 실패/빈명단/타임아웃 처리. 결과 CSV 내보내기(검토).

### SNAP-5 — 복합조건 (후속) — AND/OR 다중 토큰(예 TON≥100 AND NFT). 스캔 교집합/합집합.
### SNAP-6 — 영속 잡스토어(Redis/KV) + 캐시(동일 token/block 재사용) (후속, 멀티인스턴스 시).
### SNAP-7 — 인덱서 대체(대용량) — RPC 스캔이 수십만 홀더에 느릴 때 The Graph/자체인덱싱. (후속, 수요 시)

## 마일스톤
```
M-Snap-1 (코어 라이브러리): SNAP-1 RPC스캐너 + SNAP-2 금액산정 + 단위테스트 (백엔드 무관, mock RPC)
M-Snap-2 (백엔드 API):      SNAP-3 JobStore+3 routes + 보안/레이트리밋
M-Snap-3 (UI):              SNAP-4 마법사 스냅샷 빌더 + 진행률 → end-to-end(포크/실토큰)
M-Snap-4 (확장):            SNAP-5 복합 / SNAP-6 영속·캐시 / SNAP-7 인덱서
```

## 선결 결정 (사용자/K0)
1. **아카이브 RPC** — Alchemy 무료티어(SEPOLIA_RPC_URL 서버측 재사용). 메인넷용은 mainnet Alchemy 키 필요(무료티어 OK). → contracts/.env 또는 apps/web 서버 env(.env, NEXT_PUBLIC 아님).
2. **proofs 저장** — 1차 응답반환, B1(IPFS) 머지 시 CID.
3. **CU 예산/상한** — 잡당 호출 상한(무료티어 보호). 기본값 정하고 초과 시 안내.
4. **비례 dust 정책** — 버림 + 총량은 실제 합(기본).

## 리스크
- Dune API 유료·레이트리밋 → 캐시·동일쿼리 재사용.
- 큰 명단 = 느림 → 비동기(SNAP-6).
- 스냅샷 블록의 정확성(파이널리티) → 충분히 과거 블록 권장.
