// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20 } from "solmate/tokens/ERC20.sol";

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
contract DropFactory is Ownable {
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

    /// @notice Basis-points denominator and the maximum allowed percentage fee (10%).
    uint16 public constant MAX_FEE_BPS = 1000;

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
    uint16 public defaultFeeBps = 50; // 0.5%

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

    /// @param initialOwner       Admin (sets fees/registries/treasury, curates tokens, withdraws).
    /// @param operatorRegistry_  zk-X509 IdentityRegistry gating campaign creators (gate 1).
    /// @param zkFactory_         zk-X509 RegistryFactory validating customer registries.
    /// @param treasury_          Fixed fee-withdrawal destination.
    constructor(
        address initialOwner,
        address operatorRegistry_,
        IRegistryFactoryLike zkFactory_,
        address treasury_
    ) Ownable(initialOwner) {
        if (operatorRegistry_ == address(0) || address(zkFactory_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }
        _requireContract(operatorRegistry_);
        _requireContract(address(zkFactory_));
        operatorRegistry = operatorRegistry_;
        zkFactory = zkFactory_;
        treasury = treasury_;
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
                _requireContract(token);
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
            IERC20(token).safeTransfer(to, amount);
            emit FeesWithdrawn(token, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Campaign creation
    // ---------------------------------------------------------------------

    /// @notice Create an identity-gated Merkle airdrop campaign.
    /// @dev The fee is charged on top of the distribution: the operator must approve
    ///      `totalAmount + fee` of `airdropToken`; the drop is funded with `totalAmount` and the
    ///      vault accrues `fee`.
    /// @param airdropType      Distribution type (must be a valid `AirdropType`).
    /// @param airdropToken     ERC20 distributed to claimers (must be allow-listed).
    /// @param merkleRoot       Root over `keccak256(abi.encodePacked(index, account, amount))` leaves.
    /// @param totalAmount      Total `airdropToken` funded into the drop.
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
    ) external returns (address drop) {
        AirdropType t = _toType(airdropType);
        if (airdropToken == address(0) || identityRegistry == address(0)) revert InvalidAddress();
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (totalAmount == 0) revert ZeroTotalAmount();
        // Claim window: deadline in the future, opens before it closes, and at least MIN_DURATION
        // of *effective* (claimable-from-now) window — a past startTime cannot shrink it.
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (startTime >= deadline) revert InvalidWindow();
        uint256 effectiveStart = startTime < block.timestamp ? block.timestamp : startTime;
        if (deadline - effectiveStart < MIN_DURATION) revert InvalidWindow();
        _requireContract(airdropToken);

        // Gate 1: campaign creator must be a verified operator.
        _requireVerifiedOperator();
        // Customer registry must be a genuine zk-X509 IdentityRegistry.
        if (!zkFactory.isRegistry(identityRegistry)) revert NotAStandardRegistry();
        // The airdrop token must be on the admin-curated allow-list.
        if (tokenTier[airdropToken] != TokenTier.ALLOWED) revert TokenNotAllowed();

        uint256 fee = _computeFee(airdropToken, totalAmount);

        // Deploy the drop (operator = msg.sender, factory = this via MerkleDrop's msg.sender).
        drop = address(
            new MerkleDrop(
                ERC20(airdropToken),
                merkleRoot,
                startTime,
                deadline,
                IIdentityRegistry(identityRegistry),
                msg.sender
            )
        );
        _drops.push(drop);

        // Fund the drop with the full distribution; the fee is charged on top into the vault.
        // Exact-receipt guards reject fee-on-transfer / rebasing tokens.
        _pullExact(IERC20(airdropToken), msg.sender, drop, totalAmount);
        if (fee > 0) {
            collectedFees[airdropToken] += fee; // CEI: credit before the external pull
            _pullExact(IERC20(airdropToken), msg.sender, address(this), fee);
        }

        emit DropCreated(
            drop,
            msg.sender,
            t,
            airdropToken,
            identityRegistry,
            merkleRoot,
            totalAmount,
            startTime,
            deadline,
            fee
        );
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

    /// @dev Gate 1: revert unless `msg.sender` is currently verified against `operatorRegistry`.
    function _requireVerifiedOperator() private view {
        if (IIdentityRegistry(operatorRegistry).verifiedUntil(msg.sender) < block.timestamp) {
            revert OperatorNotVerified();
        }
    }

    /// @dev `safeTransferFrom` that requires `to` to net exactly `amount`, reverting
    ///      `IncorrectAmountReceived` for fee-on-transfer / rebasing tokens that would
    ///      otherwise mis-account the vault or under-fund a campaign.
    function _pullExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 balBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        unchecked {
            if (token.balanceOf(to) - balBefore != amount) revert IncorrectAmountReceived();
        }
    }
}
