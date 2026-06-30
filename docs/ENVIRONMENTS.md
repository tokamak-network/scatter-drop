# scatter-drop — 테스트 환경

## 권장: Sepolia 포크 (zk-X509 실연동)

zk-X509가 **Sepolia에 배포돼 있어**, anvil로 Sepolia를 포크하면 실제 RegistryFactory/
IdentityRegistry가 살아있는 상태에서 scatter-drop을 얹어 테스트할 수 있다.
로컬에서 zk-X509를 빌드·배포할 필요가 없다.

```bash
anvil --fork-url $SEPOLIA_RPC_URL   # 포크 노드 :8545
```

### zk-X509 Sepolia 주소 (chainId 11155111)
출처: `/Users/zena/tokamak-projects/zk-X509/deployments/11155111.json`

| 역할 | 컨트랙트 | 주소 |
|------|----------|------|
| zkFactory | RegistryFactory | `0x9e937dF6ac0E85979622519068412A518fa085d9` |
| 고객/운영자 신원 | IdentityRegistry(users) | `0x3cF6A96f1970053ffDf957074F988aD53D13ada3` |
| (대안) | IdentityRegistry(relayers) | `0x9fDE6182B1fd10F2eDfE15b704FE95787C170914` |
| zk-X509 owner | — | `0xc1eba383D94c6021160042491A5dfaF1d82694E6` |
| beacon / impl | — | `0xE2c5…9e8C` / `0xf38c…0EDC` |
| sp1Verifier | — | `0x261a1619cC63273de7c64872B769305732761888` |

### scatter-drop 배포 파라미터 (포크 위)
- `zkFactory` = RegistryFactory(`0x9e93…85d9`) → `isRegistry()`가 실제로 동작.
- `operatorRegistry` = users 레지스트리(`0x3cF6…ada3`) 또는 relayers. 어드민 정책에 따라.
- 캠페인 `identityRegistry`(고객) = users 레지스트리(`0x3cF6…ada3`). `isRegistry`=true여야 createDrop 통과.
- `feeToken` = 포크 위에 MockERC20 배포(또는 Sepolia ERC20).
- `treasury` = 테스트 주소.

### 검증된 테스트 지갑 만들기 (zk 증명 없이)
E2E에서 `verifiedUntil(addr) >= now`가 필요하지만 포크에선 실제 zk 증명 생성이 어렵다.
→ **foundry 치트코드로 스토리지 오버라이드**로 테스트 지갑을 "검증됨"으로 만든다.
- forge script/test: `vm.store(registry, slot, futureTimestamp)` — `verifiedUntil` 매핑 슬롯에 기록.
- 또는 anvil RPC: `anvil_setStorageAt`.
- 슬롯 계산: `keccak256(abi.encode(account, uint256(verifiedUntilSlotIndex)))`.
  (`IdentityRegistry`의 `verifiedUntil` public mapping 슬롯 인덱스는 컨트랙트 스토리지 레이아웃에서 확인.)
- 운영자·고객 테스트 지갑 각각 미래 만료값으로 세팅하면 게이트 통과.

### 필요 환경변수
- `SEPOLIA_RPC_URL` — Alchemy/Infura/공개 RPC. (없으면 K1이 발급)

> 산출물: `scripts/`의 배포 스크립트가 위 주소를 주입해 DropFactory 배포 →
> `deployments/<chainId>.json`(또는 포크용 산출물) 기록. SDK/프론트가 이를 소비.
