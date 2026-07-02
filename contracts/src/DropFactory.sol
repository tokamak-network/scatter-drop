// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeTransferLib } from "solmate/utils/SafeTransferLib.sol";
import { LibClone } from "solady/utils/LibClone.sol";
import { Ownable } from "solady/auth/Ownable.sol";
import { UUPSUpgradeable } from "solady/utils/UUPSUpgradeable.sol";
import { Initializable } from "solady/utils/Initializable.sol";

import { IIdentityRegistry } from "./interfaces/IIdentityRegistry.sol";
import { IRegistryFactoryLike } from "./interfaces/IRegistryFactoryLike.sol";
import { MerkleDrop } from "./MerkleDrop.sol";

/// @title DropFactory
/// @notice Self-service factory for compliant, identity-gated Merkle airdrops. Each
///         `createDrop` deploys a `MerkleDrop`, funds it with the airdrop tokens, and charges
///         a creation fee (in the same airdrop token) into the fee vault.
/// @dev    Two identity gates (DEV-PLAN §2.2):
///         - Gate 1 (here): the operator (campaign creator) must be verified against the
///           global `operatorRegistry`.
///         - Gate 2 (in MerkleDrop): each claimer must be verified against the campaign's
///           customer `identityRegistry`.
///         The airdrop token must be on the admin-curated allow-list (`tokenTier == ALLOWED`).
///         The allow-list is neutral platform curation of established, suitable assets; the
///         platform makes no securities determination and operators remain responsible for
///         the legal status of what they distribute.
///         Fees are priced per token, either as a percentage of `totalAmount` (`PERCENT`,
///         basis points) or a flat amount (`FLAT`), and are charged on top of the distribution
///         (the drop is funded with the full `totalAmount`; the fee is pulled in addition).
///         Fees accrue in `collectedFees[airdropToken]` and are withdrawable only to the fixed
///         `treasury`. Trust model and audit summary live in `docs/SECURITY.md`; supported
///         tokens are standard, non-rebasing, non-fee-on-transfer ERC20 (exact-receipt guard).
contract DropFactory is Initializable, UUPSUpgradeable, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Airdrop distribution mechanisms. v1 ships CSV (Merkle) only; the rest
    ///         are reserved so their ABI slots are stable for later milestones.
    enum AirdropType {
        CSV,
        ONCHAIN_SNAPSHOT,
        ONCHAIN_GATED,
        SOCIAL
    }

    /// @notice Allow-list status of an airdrop token. `ALLOWED` tokens are curated by the admin.
    enum TokenTier {
        NONE,
        ALLOWED
    }

    /// @notice Fee pricing mode for a token: a percentage of the distribution or a flat amount.
    enum FeeMode {
        PERCENT,
        FLAT
    }

    /// @notice Campaign parameters shared by both create paths. `onApprove` decodes
    ///         this from its `data` argument via `abi.decode(data, (DropParams))`, so
    ///         any off-chain encoder (SDK) MUST encode these fields in this order.
    struct DropParams {
        uint8 airdropType;
        bytes32 merkleRoot;
        uint256 totalAmount;
        uint64 startTime;
        uint64 deadline;
        address identityRegistry;
    }

    /// @notice Basis-points denominator and the maximum allowed percentage fee (10%).
    uint16 public constant MAX_FEE_BPS = 1000;

    /// @notice Sentinel `airdropToken` value meaning "distribute native ETH".
    ///         Matches `MerkleDrop.NATIVE`; funding/fees are paid in ETH via `msg.value`.
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Minimum effective claim window (`deadline - max(startTime, now)`). Prevents a
    ///         publish-and-instantly-sweep campaign that would mislead would-be claimers.
    uint256 public constant MIN_DURATION = 1 hours;

    /// @notice zk-X509 IdentityRegistry that gates who may create campaigns (gate 1).
    address public operatorRegistry;

    /// @notice zk-X509 RegistryFactory used to validate customer registries passed to `createDrop`.
    IRegistryFactoryLike public zkFactory;

    /// @notice Fixed destination for fee withdrawals. Fees can never leave to an arbitrary address.
    address public treasury;

    /// @notice Default fee mode applied to tokens without a per-token override.
    FeeMode public defaultFeeMode;

    /// @notice Default percentage fee (basis points) applied to `PERCENT` tokens without an override.
    /// @dev Set to 50 (0.5%) in `initialize` — an inline initializer would not run behind the proxy.
    uint16 public defaultFeeBps;

    /// @notice MerkleDrop logic contract; every campaign is a minimal-proxy clone of it.
    address public dropImplementation;

    /// @notice Emergency service pause. When true, `createDrop` is blocked (new
    ///         campaigns can't be created); existing drops' claims/sweeps are
    ///         unaffected (they live on independent clone contracts).
    bool public paused;

    /// @notice Total fees accrued and not yet withdrawn, per airdrop token.
    mapping(address => uint256) public collectedFees;

    /// @notice Allow-list tier of each airdrop token (`createDrop` requires `ALLOWED`).
    mapping(address => TokenTier) public tokenTier;

    /// @notice Per-token flat fee (used when the token's effective mode is `FLAT`). `0` = unset.
    mapping(address => uint256) public flatFee;

    /// @notice Every MerkleDrop deployed by this factory, in creation order.
    address[] private _drops;

    // Per-token overrides; the `*Set` flags distinguish "unset" (use default) from an explicit value.
    mapping(address => FeeMode) private _feeModeOf;
    mapping(address => bool) private _feeModeSet;
    mapping(address => uint16) private _feeBpsOf;
    mapping(address => bool) private _feeBpsSet;

    event OperatorRegistryUpdated(address indexed operatorRegistry);
    event ZkFactoryUpdated(address indexed zkFactory);
    event TreasuryUpdated(address indexed treasury);
    event DefaultFeeModeUpdated(FeeMode mode);
    event DefaultFeeBpsUpdated(uint16 bps);
    event FeeModeUpdated(address indexed token, FeeMode mode);
    event FeeBpsUpdated(address indexed token, uint16 bps);
    event FlatFeeUpdated(address indexed token, uint256 amount);
    event AllowedTokenSet(address indexed token, bool allowed, address indexed caller);
    event PausedSet(bool paused);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event DropCreated(
        address indexed drop,
        address indexed operator,
        AirdropType indexed airdropType,
        address airdropToken,
        address identityRegistry,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 startTime,
        uint64 deadline,
        uint256 fee
    );
    /// @notice Emitted when a drop's operator records the IPFS CID of its `proofs.json`.
    ///         Event-only (no storage): the latest event for a `drop` is the current CID.
    event ProofsPublished(address indexed drop, string cid);

    error InvalidAddress();
    error InvalidAirdropType();
    error OperatorNotVerified();
    error NotAStandardRegistry();
    error InvalidDeadline();
    error InvalidWindow();
    error ZeroTotalAmount();
    error InvalidMerkleRoot();
    error InsufficientCollectedFees();
    error NotAContract();
    error IncorrectAmountReceived();
    error TokenNotAllowed();
    error FeeNotConfigured();
    error FeeTooHigh();
    error IncorrectValue();
    error UnknownDrop();
    error NotDropOperator();
    error EmptyCid();
    error ServicePaused();

    /// @dev Lock the implementation; the proxy is configured via `initialize`.
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time proxy setup. Deploys the MerkleDrop logic once (campaigns
    ///         clone it) and sets the registries, treasury, owner, and default fee.
    /// @param initialOwner       Admin (sets fees/registries/treasury, curates tokens, withdraws).
    /// @param operatorRegistry_  zk-X509 IdentityRegistry gating campaign creators (gate 1).
    /// @param zkFactory_         zk-X509 RegistryFactory validating customer registries.
    /// @param treasury_          Fixed fee-withdrawal destination.
    function initialize(
        address initialOwner,
        address operatorRegistry_,
        IRegistryFactoryLike zkFactory_,
        address treasury_
    ) external initializer {
        if (
            initialOwner == address(0) || operatorRegistry_ == address(0)
                || address(zkFactory_) == address(0) || treasury_ == address(0)
        ) {
            revert InvalidAddress();
        }
        _requireContract(operatorRegistry_);
        _requireContract(address(zkFactory_));
        _initializeOwner(initialOwner);
        operatorRegistry = operatorRegistry_;
        zkFactory = zkFactory_;
        treasury = treasury_;
        defaultFeeBps = 50; // 0.5% (inline initializers don't run behind a proxy)
        // Deploy the MerkleDrop logic once; every campaign is a cheap clone of it.
        dropImplementation = address(new MerkleDrop());
    }

    /// @notice Pause/unpause the service. While paused, `createDrop` reverts;
    ///         existing campaigns keep working (claim/sweep are on the clones).
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @dev UUPS: only the owner may upgrade the factory implementation.
    function _authorizeUpgrade(address) internal override onlyOwner { }

    /// @dev Defense-in-depth: make Solady's `_initializeOwner` revert on a second
    ///      call. `initialize` is already `initializer`-guarded, so this only
    ///      matters if a future upgrade adds another owner-init path.
    function _guardInitializeOwner() internal pure override returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------------
    // Admin — fees
    // ---------------------------------------------------------------------

    /// @notice Set the default fee mode for tokens without a per-token override.
    function setDefaultFeeMode(FeeMode mode) external onlyOwner {
        defaultFeeMode = mode;
        emit DefaultFeeModeUpdated(mode);
    }

    /// @notice Set the default percentage fee (basis points) for `PERCENT` tokens without an override.
    function setDefaultFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        defaultFeeBps = bps;
        emit DefaultFeeBpsUpdated(bps);
    }

    /// @notice Override the fee mode for a specific token.
    function setFeeMode(address token, FeeMode mode) external onlyOwner {
        _feeModeOf[token] = mode;
        _feeModeSet[token] = true;
        emit FeeModeUpdated(token, mode);
    }

    /// @notice Override the percentage fee (basis points) for a specific token.
    function setFeeBps(address token, uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        _feeBpsOf[token] = bps;
        _feeBpsSet[token] = true;
        emit FeeBpsUpdated(token, bps);
    }

    /// @notice Set the flat fee for a token (used when its effective mode is `FLAT`).
    function setFlatFee(address token, uint256 amount) external onlyOwner {
        flatFee[token] = amount;
        emit FlatFeeUpdated(token, amount);
    }

    // ---------------------------------------------------------------------
    // Admin — registries / treasury / token curation
    // ---------------------------------------------------------------------

    /// @notice Update the operator (gate 1) registry.
    function setOperatorRegistry(address operatorRegistry_) external onlyOwner {
        if (operatorRegistry_ == address(0)) revert InvalidAddress();
        _requireContract(operatorRegistry_);
        operatorRegistry = operatorRegistry_;
        emit OperatorRegistryUpdated(operatorRegistry_);
    }

    /// @notice Update the zk-X509 RegistryFactory used to validate customer registries.
    function setZkFactory(IRegistryFactoryLike zkFactory_) external onlyOwner {
        if (address(zkFactory_) == address(0)) revert InvalidAddress();
        _requireContract(address(zkFactory_));
        zkFactory = zkFactory_;
        emit ZkFactoryUpdated(address(zkFactory_));
    }

    /// @notice Update the fixed fee-withdrawal destination.
    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Admin curation of the airdrop-token allow-list: allow or disallow `token`.
    /// @dev Neutral platform curation of established, suitable assets — not a securities
    ///      determination. Allowing requires `token` to be a contract.
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (allowed) {
            if (tokenTier[token] != TokenTier.ALLOWED) {
                // The NATIVE sentinel has no code; every other allowed token must be a contract.
                if (token != NATIVE) _requireContract(token);
                tokenTier[token] = TokenTier.ALLOWED;
                emit AllowedTokenSet(token, true, msg.sender);
            }
        } else if (tokenTier[token] != TokenTier.NONE) {
            tokenTier[token] = TokenTier.NONE;
            emit AllowedTokenSet(token, false, msg.sender);
        }
    }

    /// @notice Withdraw accrued fees of `token` to the fixed `treasury`.
    function withdrawFees(address token, uint256 amount) external onlyOwner {
        uint256 collected = collectedFees[token];
        if (amount > collected) revert InsufficientCollectedFees();
        // Skip the state write + transfer for a zero withdrawal (some ERC20s revert on zero-value).
        if (amount > 0) {
            unchecked {
                collectedFees[token] = collected - amount;
            }
            address to = treasury;
            if (token == NATIVE) {
                SafeTransferLib.safeTransferETH(to, amount);
            } else {
                IERC20(token).safeTransfer(to, amount);
            }
            emit FeesWithdrawn(token, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Campaign creation
    // ---------------------------------------------------------------------

    /// @notice Create an identity-gated Merkle airdrop campaign.
    /// @dev The fee is charged on top of the distribution. For an ERC20, the operator must approve
    ///      `totalAmount + fee` of `airdropToken`; the drop is funded with `totalAmount` and the
    ///      vault accrues `fee`. For native ETH (`airdropToken == NATIVE`), the operator sends
    ///      `msg.value == totalAmount + fee`; the drop is funded with `totalAmount` ETH and `fee`
    ///      ETH stays in the factory vault. ERC20 drops must send no ETH.
    /// @param airdropType      Distribution type (must be a valid `AirdropType`).
    /// @param airdropToken     ERC20 distributed to claimers, or `NATIVE` for ETH (must be allow-listed).
    /// @param merkleRoot       Root over `keccak256(abi.encodePacked(index, account, amount))` leaves.
    /// @param totalAmount      Total `airdropToken` (or wei) funded into the drop.
    /// @param startTime        Unix time at/after which claims open (may be now or future).
    /// @param deadline         Unix time after which claims close and the operator may sweep;
    ///                         the effective claim window must be at least `MIN_DURATION`.
    /// @param identityRegistry zk-X509 IdentityRegistry gating claimers (gate 2).
    /// @return drop            Address of the deployed MerkleDrop.
    function createDrop(
        uint8 airdropType,
        address airdropToken,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 startTime,
        uint64 deadline,
        address identityRegistry
    ) external payable returns (address drop) {
        // 2-step path: operator pre-approved this factory for `totalAmount + fee`.
        DropParams memory p =
            DropParams(airdropType, merkleRoot, totalAmount, startTime, deadline, identityRegistry);
        return _createDrop(msg.sender, airdropToken, _computeFee(airdropToken, totalAmount), p);
    }

    /// @notice One-transaction path for tokens with `approveAndCall` (Tokamak TON /
    ///         SeigToken). The operator calls `token.approveAndCall(factory,
    ///         totalAmount + fee, data)`, which approves this factory and calls this
    ///         in the same tx. The airdrop token is the caller (`msg.sender`);
    ///         `data` is `abi.encode(DropParams)` (see the `DropParams` struct).
    /// @dev Returns true per the SeigToken `onApprove` ABI. The token is trusted
    ///      only insofar as it's allow-listed (re-checked in `_createDrop`).
    function onApprove(address owner, address spender, uint256 amount, bytes calldata data)
        external
        returns (bool)
    {
        // The approval must name this factory as spender; the caller is the token.
        if (spender != address(this)) revert InvalidAddress();
        DropParams memory p = abi.decode(data, (DropParams));
        // The approved amount must exactly cover distribution + fee (computed once
        // here, then forwarded so `_createDrop` doesn't recompute it).
        uint256 fee = _computeFee(msg.sender, p.totalAmount);
        if (amount != p.totalAmount + fee) revert IncorrectValue();
        _createDrop(owner, msg.sender, fee, p);
        return true;
    }

    /// @dev Shared create logic for `createDrop` (2-step) and `onApprove` (1-tx).
    ///      `operator` is the campaign creator + funder; `fee` is precomputed by the
    ///      caller. ERC20 funding is pull-to-factory then push-to-drop, so a token
    ///      that only allows `transferFrom` where the caller is `from` or `to` (e.g.
    ///      TON) works: the factory pulls as the *recipient*, then transfers to the
    ///      drop as the *sender*. Both legs are exact-receipt guarded (fee-on
    ///      -transfer / rebasing tokens revert). Native ETH funding is `msg.value`.
    function _createDrop(address operator, address airdropToken, uint256 fee, DropParams memory p)
        internal
        returns (address drop)
    {
        // Emergency stop: block new campaigns while paused (existing drops keep working).
        if (paused) revert ServicePaused();
        AirdropType t = _toType(p.airdropType);
        // identityRegistry is OPTIONAL (W24): address(0) = no customer gate (open claim).
        if (airdropToken == address(0)) revert InvalidAddress();
        if (p.merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (p.totalAmount == 0) revert ZeroTotalAmount();
        // Claim window: deadline in the future, opens before it closes, and at least MIN_DURATION
        // of *effective* (claimable-from-now) window — a past startTime cannot shrink it.
        if (p.deadline <= block.timestamp) revert InvalidDeadline();
        if (p.startTime >= p.deadline) revert InvalidWindow();
        uint256 effectiveStart = p.startTime < block.timestamp ? block.timestamp : p.startTime;
        if (p.deadline - effectiveStart < MIN_DURATION) revert InvalidWindow();

        // Allow-list check first: a local storage read is far cheaper than the
        // external calls below, so an unlisted token reverts early.
        if (tokenTier[airdropToken] != TokenTier.ALLOWED) revert TokenNotAllowed();
        // Gate 1: campaign creator must be a verified operator.
        _requireVerifiedOperator(operator);
        // Customer gate is optional (W24): when set, it must be a genuine zk-X509
        // IdentityRegistry; address(0) leaves the campaign open (no identity gate).
        if (p.identityRegistry != address(0) && !zkFactory.isRegistry(p.identityRegistry)) {
            revert NotAStandardRegistry();
        }

        bool native = airdropToken == NATIVE;
        // Native drops carry funding in msg.value; ERC20 drops must send none.
        if (native) {
            if (msg.value != p.totalAmount + fee) revert IncorrectValue();
        } else if (msg.value != 0) {
            revert IncorrectValue();
        }

        // Clone the drop logic with its config baked into the clone's bytecode
        // (EIP-1167 clone-with-immutable-args). Arg order MUST match
        // MerkleDrop._config()'s abi.decode. Validation above is authoritative:
        // the factory is the sole creator, so the clone itself does not re-check.
        drop = LibClone.clone(
            dropImplementation,
            abi.encode(
                airdropToken, p.merkleRoot, p.startTime, p.deadline, p.identityRegistry, operator, address(this)
            )
        );
        _drops.push(drop);

        if (native) {
            // Credit the fee (retained as this contract's ETH) before the external
            // value transfer, then fund the drop with the distribution.
            if (fee > 0) collectedFees[NATIVE] += fee;
            SafeTransferLib.safeTransferETH(drop, p.totalAmount);
        } else {
            // CEI: credit the fee before the external transfers. The factory holds
            // total+fee only transiently within this call; after the push it nets
            // exactly `fee`, preserving "factory ERC20 balance == collected fees".
            if (fee > 0) collectedFees[airdropToken] += fee;
            _pullExact(IERC20(airdropToken), operator, address(this), p.totalAmount + fee);
            _pushExact(IERC20(airdropToken), drop, p.totalAmount);
        }

        emit DropCreated(
            drop, operator, t, airdropToken, p.identityRegistry, p.merkleRoot, p.totalAmount, p.startTime, p.deadline, fee
        );
    }

    // ---------------------------------------------------------------------
    // Proofs
    // ---------------------------------------------------------------------

    /// @notice Record the IPFS CID of a drop's `proofs.json` on-chain, so claimers can
    ///         locate their inclusion proofs without a trusted server. Only the drop's
    ///         operator may publish, and only for a drop this factory deployed.
    /// @dev Event-only (no storage): indexers/clients take the latest `ProofsPublished`
    ///      for a `drop` as its current CID. Re-publishing is allowed (e.g. re-pin to a
    ///      new CID) — the guards are the only invariant. This is a pure addition; it does
    ///      not touch `createDrop` or any existing state.
    ///
    ///      Trust model: the guards check that `drop` *reports* this factory as its deployer
    ///      and `msg.sender` as its operator. For a genuine factory-deployed MerkleDrop these
    ///      are authoritative immutables. A contrived contract could return the same values,
    ///      but only about *itself* — it cannot make a real drop's `operator()` return a
    ///      non-operator, so no one can publish a CID under another party's real drop. Indexers
    ///      key events by known drop addresses, so a spoofed self-address is inert noise. That
    ///      is why an `isDrop` allow-list (an SSTORE in every `createDrop`) isn't warranted here.
    /// @param drop MerkleDrop deployed by this factory.
    /// @param cid  IPFS CID (CIDv1 base32) of the drop's `proofs.json`; must be non-empty.
    function publishProofs(address drop, string calldata cid) external {
        if (bytes(cid).length == 0) revert EmptyCid();
        if (drop.code.length == 0) revert UnknownDrop(); // EOA has no factory() to call
        MerkleDrop d = MerkleDrop(payable(drop));
        // The drop must report this factory as its deployer (MerkleDrop's immutable `factory`),
        // caught so a contract without a matching `factory()` yields a clean UnknownDrop instead
        // of an opaque decode revert — no O(n) `_drops` scan, no `isDrop` storage.
        try d.factory() returns (address deployer) {
            if (deployer != address(this)) revert UnknownDrop();
        } catch {
            revert UnknownDrop();
        }
        if (d.operator() != msg.sender) revert NotDropOperator();
        emit ProofsPublished(drop, cid);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Effective fee mode for `token` (per-token override, else the default).
    function feeModeOf(address token) public view returns (FeeMode) {
        return _feeModeSet[token] ? _feeModeOf[token] : defaultFeeMode;
    }

    /// @notice Effective percentage fee (basis points) for `token` (override, else the default).
    function feeBpsOf(address token) public view returns (uint16) {
        return _feeBpsSet[token] ? _feeBpsOf[token] : defaultFeeBps;
    }

    /// @notice Creation fee charged for distributing `totalAmount` of `token` (preview helper).
    /// @dev Reverts `FeeNotConfigured` for a `FLAT` token with no flat fee set, mirroring `createDrop`.
    function feeOf(address token, uint256 totalAmount) external view returns (uint256) {
        return _computeFee(token, totalAmount);
    }

    /// @notice True if `token` is on the allow-list.
    function isAllowed(address token) external view returns (bool) {
        return tokenTier[token] == TokenTier.ALLOWED;
    }

    /// @notice Number of drops created by this factory.
    function dropsLength() external view returns (uint256) {
        return _drops.length;
    }

    /// @notice Drop address at `index` in creation order.
    function dropAt(uint256 index) external view returns (address) {
        return _drops[index];
    }

    /// @notice Full list of drops created by this factory.
    function allDrops() external view returns (address[] memory) {
        return _drops;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Compute the creation fee for `totalAmount` of `token` per its effective mode.
    ///      PERCENT may legitimately yield 0 (admin-set 0 bps, or rounding on a tiny amount);
    ///      FLAT requires a configured (non-zero) fee, else `FeeNotConfigured`.
    function _computeFee(address token, uint256 totalAmount) private view returns (uint256) {
        if (feeModeOf(token) == FeeMode.PERCENT) {
            return totalAmount * feeBpsOf(token) / 10_000;
        }
        uint256 f = flatFee[token];
        if (f == 0) revert FeeNotConfigured();
        return f;
    }

    /// @dev Validate and narrow a raw `uint8` to `AirdropType`. Reverts on out-of-range input
    ///      with a descriptive error instead of a bare enum-conversion panic.
    function _toType(uint8 airdropType) private pure returns (AirdropType) {
        if (airdropType > uint8(type(AirdropType).max)) revert InvalidAirdropType();
        return AirdropType(airdropType);
    }

    /// @dev Revert `NotAContract` if `a` has no code. Fails misconfiguration fast with a
    ///      clear error instead of an opaque ABI-decode/AddressEmptyCode revert downstream.
    function _requireContract(address a) private view {
        if (a.code.length == 0) revert NotAContract();
    }

    /// @dev Gate 1: revert unless `operator` is currently verified against `operatorRegistry`.
    function _requireVerifiedOperator(address operator) private view {
        if (IIdentityRegistry(operatorRegistry).verifiedUntil(operator) < block.timestamp) {
            revert OperatorNotVerified();
        }
    }

    /// @dev `safeTransferFrom` that requires `to` to net exactly `amount`, reverting
    ///      `IncorrectAmountReceived` for fee-on-transfer / rebasing tokens that would
    ///      otherwise mis-account the vault or under-fund a campaign.
    function _pullExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 balBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        _requireExactReceipt(token, to, balBefore, amount);
    }

    /// @dev `safeTransfer` (factory is the sender — TON-safe) with the same exact
    ///      -receipt guard as `_pullExact`.
    function _pushExact(IERC20 token, address to, uint256 amount) private {
        uint256 balBefore = token.balanceOf(to);
        token.safeTransfer(to, amount);
        _requireExactReceipt(token, to, balBefore, amount);
    }

    /// @dev Reverts unless `to`'s balance rose by exactly `amount` — the single
    ///      load-bearing guard rejecting fee-on-transfer / rebasing tokens.
    function _requireExactReceipt(IERC20 token, address to, uint256 balBefore, uint256 amount) private view {
        uint256 balAfter = token.balanceOf(to);
        // Explicit `>=` guard: a balance that *drops* (rebasing-down / burn-on-
        // transfer token) must revert here, not wrap around an unchecked subtraction.
        if (balAfter < balBefore || balAfter - balBefore != amount) revert IncorrectAmountReceived();
    }
}
