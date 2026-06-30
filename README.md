# scatter-drop

누구나 에어드랍 캠페인을 만들어 자기 고객에게 토큰을 뿌릴 수 있는 **셀프서비스 멀티테넌트 플랫폼**.
캠페인은 **zk-X509 신원검증**으로 게이팅할 수 있다 — **운영자가 캠페인마다 선택**한다. 켜면 지정한
IdentityRegistry에 등록된 신원(국가 PKI 또는 자체 발급 CA)을 거쳐야 받고, 끄면 공개 claim이다.

> 포지셔닝: **중립 분배 인프라** — 신원검증을 *옵션*으로 지원해, 필요하면 국가 PKI 기반 실명·법적 분배
> (RWA·규제 토큰)까지 커버하되 일반 공개 에어드랍도 가능. 토큰 화이트리스트·수수료는 어드민 큐레이션.
> 자세한 내용은 [`docs/DESIGN.md`](docs/DESIGN.md) · [`docs/FRONTEND-IA.md`](docs/FRONTEND-IA.md) · [`docs/DEV-PLAN.md`](docs/DEV-PLAN.md).

## 구조 (monorepo)

```
contracts/        Foundry — DropFactory, MerkleDrop (+ 후속 GatedDrop)
packages/merkle/  CSV → Merkle 트리/proof 생성 라이브러리
apps/web/         Next.js 대시보드 + 클레임 페이지
scripts/          배포/운영 스크립트
docs/             설계·IA·개발계획 문서
```

## 신원 게이트 (zk-X509 연동)

두 종류의 신원검증이 캠페인에 강제된다:

| 게이트 | 대상 | CA 레지스트리 | 강제 시점 |
|--------|------|--------------|-----------|
| 운영자 | 캠페인 만드는 지갑 | 전역 1개 (어드민 등록) | `createDrop` |
| 고객 | 에어드랍 받는 지갑 | 캠페인마다 지정 | `claim` |

연동 대상: [zk-X509](https://github.com/tokamak-network) RegistryFactory / IdentityRegistry.

## 개발

```bash
# 의존성
pnpm install
git submodule update --init --recursive   # contracts/lib

# 컨트랙트
pnpm contracts:build
pnpm contracts:test
```

요구 사항: Foundry, pnpm ≥ 8, Node ≥ 20.

## 라이선스

MIT
