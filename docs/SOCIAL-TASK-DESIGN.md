# 소셜·태스크 자격 (퀘스트) — 리서치 기반 설계

DESIGN §5.3 / ELIGIBILITY-2-3.md "자격 3"의 구체화. 이 문서가 소셜·태스크의 **단일 설계 기준**이며,
ELIGIBILITY-2-3.md §자격3의 가정 중 일부(`apps/api` 신설, "팔로우를 API로 검증")를 명시적으로 대체한다.
작성 근거: 2026-07 업계 리서치 (Galxe/Zealy/Layer3/TaskOn/Intract 검증 실태 + X·Discord·Telegram·GitHub API 실측 조사).

---

## 0. 결론 요약

1. **퀘스트 백엔드 = 명단 생산 유틸리티.** 검증된 완료 기록 → 마감 시 `(address, amount)` 집계 →
   기존 `buildDrop` → `createDrop(type=SOCIAL)` → 기존 proofs API·클레임 페이지. **컨트랙트 변경 0.**
2. **별도 `apps/api`를 만들지 않는다.** proofs·announcements·networks가 모두 Next.js API 라우트 + Prisma로
   수렴했으므로 퀘스트도 `apps/web` 확장. (ELIGIBILITY-2-3.md SOC-1의 "apps/api 부트스트랩"을 대체)
3. **검증 정직성이 차별점.** 업계는 X 팔로우를 검증하지 못하면서 하는 척한다(아래 §2). 우리는
   태스크마다 검증 등급(Verified / Metered / Intent)을 운영자·수령자 모두에게 그대로 표시한다.
4. **1차 구현은 무료·확실 검증만**: Discord 가입/역할 → Telegram 가입 → GitHub 스타 → 온체인 활동.
   X는 종량 과금·가격 변동성 때문에 **격리된 선택 모듈**로 후순위.
5. **Sybil 방어의 축은 zk-X509 신원게이트**(1인 1검증) — 업계가 PoH 점수로 흉내 내는 것을 우리는
   프로토콜로 가진다. SOCIAL 캠페인은 신원게이트 결합을 기본값으로 유도.

---

## 1. 배경과 범위

- 현재 위저드의 SOCIAL 타입 = 외부 퀘스트 플랫폼(Galxe/Zealy) 우승자 CSV **수동 임포트**
  (`manage/new/page.tsx`의 SOCIAL 안내 패널). 이 설계는 그 임포트를 **네이티브 퀘스트 기능**으로 대체한다.
- 유지되는 원칙: 플랫폼은 유틸리티(도구)다 — 퀘스트의 주체·보상 주체는 운영자이고 화면 카피도 운영자 귀속.
- 범위 밖: 잔액 스냅샷류(기각 결정), GatedDrop(별도 문서), 베스팅/가스리스.

## 2. 리서치 핵심 (2026-07)

### 2.1 업계 실태 — "누가 무엇을 진짜 검증하는가"

| 플랫폼 | Discord/TG 가입 | 온체인 | X 콘텐츠(트윗/QT) | X 팔로우/좋아요 |
|---|---|---|---|---|
| Galxe | ✅ 봇 실검증 | ✅ 인덱서 | 💰 유료 크레딧("Authentic Verification", Business+ $999+/mo, 소진 시 조용히 인텐트로 강등) | ❌ 공식 문서가 "인텐트만 기록" 자인 |
| Zealy | ✅ 봇 실검증 | ✅ | ✅ 사용자가 트윗 URL 제출 → 단건 조회로 작성자·인용대상 검증 | ❌ 문서에 API 검증 언급 없음 |
| Layer3 | ✅ | ✅ (주력) | — | ❌ 문서에 명시적으로 "unverified" 표기 |

- 원인: X API에서 팔로워/팔로잉 목록은 사실상 Enterprise 전용($42k+/mo), 2026-02부터 신규 개발자는
  선불 크레딧 종량제만 가능(유저 조회 $0.01/건, 포스트 조회 $0.005/건).
- 업계의 대응: **행동 검증을 포기하고 사람 검증으로 이동** — Galxe Passport/Score(KYC+얼굴),
  Zealy Proof of Humanity(ML), Intract Persona. 우리의 zk-X509 게이트가 정확히 이 자리에 있다.
- 운영자 연동의 모범: Zealy — 완료자 조회 REST API + 웹훅(QUEST_SUCCEEDED 등). 우리도 집계 API를 같은 급으로.

### 2.2 검증 실현성 매트릭스

| 태스크 | 검증 가능? | 비용 | 방법 |
|---|---|---|---|
| Discord 서버 가입 | ✅ 확실 | 무료 | OAuth2 `guilds` → `GET /users/@me/guilds`; 재검증은 봇 `GET /guilds/{id}/members/{uid}` |
| Discord 역할 보유 | ✅ 확실 | 무료 | `guilds.members.read` → member 객체(roles, `joined_at`) |
| Telegram 채널/그룹 가입 | ✅ 확실 | 무료 | 로그인 위젯(HMAC)으로 신원 바인딩 + **관리자 봇** `getChatMember` |
| GitHub 스타/팔로우 | ✅ 확실 | 무료 | 사용자 토큰 `GET /user/starred/{owner}/{repo}` → 204/404 |
| 온체인 활동 | ✅ 확실 | 인프라만 | 기존 Dune 프록시/RPC 패턴 재사용 |
| X 해시태그 포스트 | ✅ | ~$0.005–0.01/건 | `search/recent` `from:user #tag` (7일 윈도) |
| X 인용/트윗 | ✅ | ~$0.005–0.02/건 | Zealy 패턴: 사용자 제출 URL → 단건 조회로 작성자·인용대상 확인 |
| X 팔로우 | ⚠️ 조건부 | ~$0.01/건 | OAuth 사용자 토큰으로 `connection_status` 필드 1회 조회. **스파이크 테스트 선행 필수** (티어별 가용성 보고 상충) |
| X 좋아요/리트윗 (목록 스캔) | ❌ 규모 불가 | 리트윗어당 $0.01 | 소규모만 캐시-스캔 가능. 기본 제공하지 않음 |
| 링크 방문/스크린샷 | ❌ 아너 시스템 | — | 제공하되 Intent 등급으로 정직 표기 |

- **서드파티 스크레이퍼 API(10–50배 저렴)는 기본값으로 쓰지 않는다** — ToS 회색지대·무통보 중단 리스크.
  도입하려면 명시적 리스크 결정으로 별도 승인.

## 3. 설계 원칙

1. **검증 등급의 정직한 표기** — 태스크 타입마다 등급을 고정하고 UI에 노출:
   - `VERIFIED` (무료·확실: Discord/TG/GitHub/온체인)
   - `METERED` (실검증이지만 건당 과금: X 콘텐츠·팔로우) — 운영자에게 예상 비용 표시
   - `INTENT` (클릭 신뢰: 링크 방문, X 팔로우의 무과금 모드) — 수령자 화면에도 "미검증" 뱃지
2. **서버만 신뢰** — 완료 판정은 전부 서버측 API 호출 결과. 클라이언트 주장 무시. 마감 시 재검증 옵션.
3. **X 격리** — X 검증기는 어댑터 1개로 격리, API 키·크레딧 없으면 X 태스크가 자동으로 INTENT 강등이 아니라
   **생성 자체가 비활성**(Galxe식 조용한 강등 금지).
4. **컨트랙트 변경 0** — 산출물은 언제나 명단. 클레임 경로는 기존 MerkleDrop 그대로.
5. **신원게이트 우선** — SOCIAL 캠페인 생성 시 신원게이트 결합을 기본 켬(`forcesIdentity`는 아니고 default-on,
   운영자가 끌 수 있되 sybil 경고 표시).

## 4. 아키텍처

```
수령자: 캠페인 퀘스트 페이지
  ① 지갑 연결 + SIWE (기존 useWalletSession)
  ② 소셜 계정 연결 (OAuth: Discord/GitHub, 위젯: Telegram, OAuth: X)
     → WalletSocial 바인딩 (1 소셜계정 = 1 지갑, 위반 시 거절)
  ③ 태스크별 "확인" → 서버 검증기 호출 → QuestCompletion 기록

운영자: 위저드/manage
  ④ 퀘스트 설정 (태스크 추가·필수 여부·검증 등급 표시·마감)
  ⑤ 마감 → 집계 API: 필수 태스크 전부 완료한 지갑 → (address, amount)
  ⑥ RecipientBuilder에 rows 주입 (DuneImport/StakingImport와 동일 슬롯)
     → 기존 buildDrop → createDrop(type=SOCIAL) → proofs POST (기존 인증 그대로)
```

재사용: iron-session(`SessionData`에 `oauthState`·소셜 바인딩 필드 추가), `requireWallet()`,
`rateLimited()`, Dune 프록시의 외부 API 호출 패턴, `RecipientBuilder.onRows`.

## 5. DB 스키마 (Prisma, apps/web/prisma/schema.prisma 확장)

```prisma
model QuestCampaign {   // 캠페인 = 아직 createDrop 전의 퀘스트 컨테이너
  id         String   @id @default(cuid())
  chainId    Int
  operator   String   // lowercased, SIWE-검증된 생성자
  title      String
  closesAt   DateTime
  amountMode String   // "equal" | "fixed-per-task" (v1: equal)
  totalAmount String  // 사람단위 문자열, 집계 시 분배
  drop       String?  // createDrop 후 연결되는 드랍 주소 (lowercased)
  tasks      QuestTask[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([operator, chainId])
}

model QuestTask {
  id         String @id @default(cuid())
  campaignId String
  campaign   QuestCampaign @relation(fields: [campaignId], references: [id])
  kind       String  // DISCORD_JOIN | DISCORD_ROLE | TELEGRAM_JOIN | GITHUB_STAR | ONCHAIN | X_POST | X_FOLLOW | LINK_VISIT
  config     String  // JSON: guildId/roleId, chatId, owner/repo, tweet 조건 등
  required   Boolean @default(true)
  tier       String  // VERIFIED | METERED | INTENT (kind에서 유도, 저장은 감사용)
}

model QuestCompletion {
  campaignId String
  wallet     String   // lowercased
  taskId     String
  verifiedAt DateTime @default(now())
  evidence   String?  // JSON: guild member joined_at, tweet id 등 (최소한만)
  @@id([campaignId, wallet, taskId])
  @@index([campaignId, wallet])
}

model WalletSocial {   // sybil 축: 1 소셜계정 = 1 지갑
  provider          String  // discord | telegram | github | x
  providerAccountId String
  wallet            String  // lowercased
  boundAt           DateTime @default(now())
  quality           String?  // JSON: 계정 나이·팔로워 등 스코어링 신호
  @@id([provider, providerAccountId])
  @@index([wallet])
}
```

## 6. API 표면 (Next.js route handlers)

| 라우트 | 인증 | 역할 |
|---|---|---|
| `POST /api/quests` · `GET/PATCH /api/quests/[id]` | requireWallet(운영자) | 퀘스트 캠페인 CRUD |
| `GET /api/quests/[id]/tasks` | 공개 | 수령자용 태스크 목록(+등급) |
| `GET /api/oauth/[provider]/start` · `/callback` | requireWallet | OAuth 시작/콜백 → WalletSocial 바인딩 |
| `POST /api/quests/[id]/verify/[taskId]` | requireWallet + rateLimited | 서버 검증기 실행 → QuestCompletion |
| `GET /api/quests/[id]/completions` | requireWallet(운영자) | 집계: 필수 완료 지갑 목록 → RecipientBuilder |

검증기는 `lib/server/questVerifiers/{discord,telegram,github,onchain,x}.ts` 어댑터로 분리 —
공통 시그니처 `verify(task, wallet, binding) → {ok, evidence}`.

## 7. Sybil 정책

1. **zk-X509 신원게이트** — SOCIAL 캠페인 default-on. 클레임 시 1인 1검증이 최종 방어선.
2. **1 소셜계정 = 1 지갑** — `WalletSocial` PK로 강제. 재바인딩은 기존 바인딩 해제 후 쿨다운.
3. **계정 품질 임계(운영자 옵션)** — Discord 계정 나이(스노우플레이크 역산, 무료), 가입 시점
   (`joined_at`이 마감 직전이면 플래그), X 계정 나이·팔로워(연결 시 1회 $0.01 조회에 포함), GitHub 계정 나이.
4. **마감 시 재검증(옵션)** — VERIFIED 태스크는 집계 직전 배치 재확인(Discord 봇 경로는 무료).

## 8. 구현 계획 (SOC 재편 — ELIGIBILITY-2-3.md의 SOC-1~7 대체)

```
SOC-1': Prisma 스키마 4모델 + 퀘스트 CRUD API + 운영자 manage UI 골격
SOC-2': Discord — OAuth(guilds) 연결 + JOIN/ROLE 검증기 + WalletSocial 바인딩   ★첫 수직 슬라이스
SOC-3': 수령자 퀘스트 페이지 (태스크 목록·등급 뱃지·확인 버튼·진행 상태)
SOC-4': 집계 → RecipientBuilder 주입 → createDrop(type=SOCIAL) 연결 (E2E 완성)
SOC-5': Telegram(로그인 위젯+관리자 봇) + GitHub(스타) 검증기
SOC-6': sybil 정책 계층 (품질 임계·재검증·신원게이트 default-on 배선)
SOC-7': X 모듈 — connection_status 스파이크 테스트 → 결과에 따라 팔로우/해시태그 검증기 (또는 INTENT 전용 확정)
SOC-8': 보안 리뷰 (SECURITY.md 후속: OAuth state/CSRF, 매핑 프라이버시, 레이트리밋, 태스크 위조)
```

- **SOC-2'까지가 첫 데모 가능 지점** (Discord 가입 퀘스트 하나가 E2E로 도는 것).
- SOC-4' 이후는 병렬 가능: (Telegram/GitHub 검증기) ⊥ (sybil 계층) ⊥ (X 스파이크).
- 프라이버시: `WalletSocial.providerAccountId` 외 소셜 데이터 저장 금지, evidence는 최소한,
  수집 동의 문구 필수 (SOC-8'에서 점검).

## 9. 열린 결정 (구현 전 확인 필요)

1. **X 모듈 도입 여부 자체** — 종량 과금($0.005–0.01/건) + 가격 변동성. v1은 X 없이
   Discord/TG/GitHub/온체인만으로 출시하고, X는 수요 확인 후 결정하는 것을 권장.
2. **amountMode** — v1은 균등 분배만? 태스크별 가중치는 후속?
3. **퀘스트 페이지 노출 위치** — 캠페인 상세(`/c/[id]`)에 통합 vs 별도 `/q/[id]`.
