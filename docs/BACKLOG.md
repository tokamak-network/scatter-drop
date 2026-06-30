# scatter-drop — 개발 백로그 (W 시리즈)

`docs/DEV-PLAN.md`(마일스톤) + `docs/COORDINATION.md`(협업) 보강.
완료: W0 부트스트랩, W1 merkle, W2 SDK골격, W3 MerkleDrop, W6 프론트 스캐폴드.
진행: W4 DropFactory(PR#5), W6.1 SDK연결·UI(K3).

범례: 담당 C=컨트랙트(K1/K2) · F=프론트(K3) · S=SDK(K0) · ✦=의존.

---

## Phase A — 컨트랙트 코어 마감 (M2/M3)

### W4 — DropFactory  ✦시임② · 담당 K2 · PR#5(진행)
게이트1·종류별수수료·고정treasury 볼트·createDrop. 자가머지 대기.
AC: 로컬 44테스트, 봇답글 닫음, 머지 → M2 완료.

### W5 — 배포·시드·anvil E2E (M3)  ✦W4 · 담당 K1
- `scripts/` 배포: DropFactory(feeToken·operatorRegistry·treasury·zkFactory 주입) 배포.
- **zk-X509 실연동 결정·구현**: 로컬 anvil에 RegistryFactory/IdentityRegistry 기동
  (서브모듈 빌드 vs 사전배포 주소). mock→실제 전환.
- **표준 CA 레지스트리 시드**: 데모 KR-NPKI 테스트 레지스트리 1개 배포 + operatorRegistry 지정.
- E2E 시나리오: operator검증→createDrop→고객검증→claim→sweep, withdrawFees→treasury.
AC: anvil 위 풀 플로우 1-스크립트 통과 + 배포주소 산출물(deployments json).

### W5a — 결정 선결 (K1, W5 착수 전)
- zk-X509 로컬 기동 방식 확정(서브모듈 vs 주소).
- 캠페인 메타데이터(이름/로고) 저장소 v1 방식(정적 JSON / 간이 DB) — F와 공유.

---

## Phase B — SDK 실연동 (M5 전제)

### W7 — SDK core 확정  ✦W4·W5 · 담당 S(K0)
- 손작성 ABI → **forge build 산출 ABI로 교체**(자동화: out/*.json → sdk/core).
- 배포주소 레지스트리(체인별 DropFactory/zkFactory) 타입드 제공.
- claim/identity/createDrop 빌더를 실제 ABI로 검증(anvil 대상 통합테스트).
AC: sdk vitest + anvil 라운드트립(encode→send→claim).

### W7a — SDK react 훅  ✦W7 · 담당 S(K0)
`useCampaign`, `useIdentityGate`(verifiedUntil), `useClaim`, `useCreateDrop`,
`useFeeOf`, `useVault`. wagmi 기반, optional peer. 프론트가 소비.

---

## Phase C — 프론트 실연동 (M5/M6/M7)  담당 F(K3)

### W6.1 — SDK 연결 + 클레임/마법사 UI  (진행)
stub ABI→SDK, 콜데이터 배선, read는 async stub seam 유지.

### W8 — M5 클레임 실연동  ✦W5·W7a
- 캠페인 상세: IdentityGate(verifiedUntil 실독)·EligibilityCheck(proof 조회)·claim 전송.
- My Claims·Explore 실데이터(이벤트/RPC 스캔). EmptyState 분기.
AC: anvil에서 미검증→차단, 검증+자격→claim 성공.

### W9 — M6 운영자 콘솔 실연동  ✦W5·W7a
- 생성 마법사 제출(createDrop tx, feeToken approve→pay→deposit).
- 캠페인 관리: Overview·**Participants 통계**(자격자/검증/클레임/추이, CSV export)·Sweep.
- 운영자 게이트(Step0) 실검증.
AC: 마법사로 실제 캠페인 생성→대시보드 반영→sweep.

### W10 — M7 어드민 콘솔 실연동  ✦W5·W7a
- Funds(setFee per type·setFeeToken)·Operator Gate(setOperatorRegistry)·
  Identity Registries(표준 큐레이션)·Fee Vault(collectedFees 조회+withdrawFees→treasury)·
  Campaigns(All)+개수+캠페인별 대시보드.
AC: 어드민 권한 게이팅, 종류별 수수료 설정·볼트 출금 동작.

---

## Phase D — 보고/문서/규제 (P2)

### W11 — 세금 문서 다운로드  (사용자 요청)  담당 F(K3)
- **운영자**: 캠페인별 분배내역 리포트(수령자·금액·시각·tx) CSV/PDF 다운로드.
- **고객**: 본인 클레임 영수증(캠페인·금액·시각·tx·체인) 다운로드(세금신고용).
- 데이터: 온체인 claim 이벤트 + 캠페인 메타. 개인정보는 고객 CA 선택공개 범위 내.
AC: 운영자/고객 각각 다운로드 버튼→유효 문서 생성.

### W12 — 법무 산출물 (출시 전)  담당 K0+사용자
- ToS·면책(운영자 책임·세금 수령자 책임), 제재국 지역차단, 증권형 토큰 배제 정책/심사.
- §8.6 기반. 변호사 검토 연계.

---

## Phase E — 하드닝 (M8)

### W13 — 컨트랙트 보안 패스  ✦Phase A · 담당 C
- reentrancy/접근제어/정수/0-transfer/인바리언트 재점검, `/security-review`,
  가스 스냅샷. 외부 감사 준비 패키지.

### W14 — 통합 E2E + 릴리스 준비
- 풀스택 E2E(배포→생성→검증→claim→sweep→출금), 문서 갱신.
- **CI/CD 등록**(이 시점에 비로소): 워크플로우 복구 + 게이트.

### W15 — 후속 기능 (post-v1, 범위외 명시)
GatedDrop(온체인 검증)·소셜/태스크 백엔드·베스팅/선착순·가스리스·멀티체인·알림.

---

## 의존 그래프 (요약)
```
W4 ─┬─ W5 ─┬─ W7 ─ W7a ─┬─ W8(M5)
    │       │            ├─ W9(M6) ── W11(세금)
    │       └─(시드)      └─ W10(M7)
W6.1(병렬) ────────────────┘
모두 → W13(보안) → W14(E2E+CI) → [W15 후속]
```

## 미결정 (결정 시 W에 편입)
- 세금 문서(W11) v1 P0 vs P2? (현재 P2 가정)
- 표준 CA 시드(W5) 데모 KR-NPKI 포함? (현재 포함 가정)
- 캠페인 메타 저장소(W5a): 정적 JSON vs 간이 DB(Firestore 등)?
- 이벤트 인덱싱(W8): 직접 RPC 스캔 vs subgraph? (v1=RPC 가정)
