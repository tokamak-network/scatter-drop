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
/// @notice Self-service factory for compliant, identity-gated Merkle airdrops.
///         Each `createDrop` deploys a `MerkleDrop`, charging a per-type creation fee
///         (payable in a chosen fee token, including native ETH) into the fee vault and
///         funding the drop with the airdrop tokens.
/// @dev    Two identity gates (DEV-PLAN §2.2):
///         - Gate 1 (here): the operator (campaign creator) must be verified against the
///           global `operatorRegistry`.
///         - Gate 2 (in MerkleDrop): each claimer must be verified against the campaign's
///           customer `identityRegistry`.
///         The airdrop token must be registered (`tokenTier != NONE`). Creation fees are
///         priced per `(feeToken, airdropType)` (`feeToken == address(0)` means native ETH),
///         accrue in `collectedFees[feeToken]`, and are withdrawable only to the fixed
///         `treasury` (no arbitrary recipient — K0 decision §5).
///         Trust model and the W13 audit summary live in `docs/SECURITY.md`. Supported fee and
///         airdrop tokens are standard ERC20; fee-on-transfer (and any non-exact transfer) is
///         rejected at creation by the exact-receipt guard (`_pullExact`). Standard rebasing
///         tokens pass at creation and are unsupported — a later rebase can under/over-fund a campaign.
contract DropFactory is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Airdrop distribution mechanisms. v1 ships CSV (Merkle) only; the rest
    ///         are reserved so their fee tiers and ABI slots are stable for later milestones.
    enum AirdropType {
        CSV,
        ONCHAIN_SNAPSHOT,
        ONCHAIN_GATED,
        SOCIAL
    }

    /// @notice Registry status of an airdrop token. `NONE` = not registered;
    ///         `COMMUNITY` = permissionlessly self-registered by a verified operator;
    ///         `OFFICIAL` = curated by the admin (surfaced first in the UI).
    enum TokenTier {
        NONE,
        COMMUNITY,
        OFFICIAL
    }

    /// @notice Sentinel fee token meaning native ETH.
    address public constant ETH = address(0);

    /// @notice Minimum lead time between campaign creation and its deadline. Prevents a
    ///         publish-and-instantly-sweep campaign that would mislead would-be claimers.
    uint256 public constant MIN_DURATION = 1 hours;

    /// @notice zk-X509 IdentityRegistry that gates who may create campaigns (gate 1).
    address public operatorRegistry;

    /// @notice zk-X509 RegistryFactory used to validate customer registries passed to `createDrop`.
    IRegistryFactoryLike public zkFactory;

    /// @notice Fixed destination for fee withdrawals. Fees can never leave to an arbitrary address.
    address public treasury;

    /// @notice Creation fee per `(feeToken, airdropType)`. `feeToken == ETH (address(0))` prices
    ///         the native-ETH option. A `feeToken` with all-zero tiers is simply not accepted.
    mapping(address => mapping(AirdropType => uint256)) private _feeOf;

    /// @notice Total fees accrued and not yet withdrawn, per fee token (`ETH` for native).
    mapping(address => uint256) public collectedFees;

    /// @notice Every MerkleDrop deployed by this factory, in creation order.
    address[] private _drops;

    /// @notice Registry tier of each airdrop token. Operators self-register `COMMUNITY`
    ///         tokens; the admin curates `OFFICIAL` ones. `createDrop` requires `!= NONE`.
    mapping(address => TokenTier) public tokenTier;

    event OperatorRegistryUpdated(address indexed operatorRegistry);
    event ZkFactoryUpdated(address indexed zkFactory);
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(address indexed feeToken, AirdropType indexed airdropType, uint256 amount);
    event AllowedTokenSet(address indexed token, TokenTier tier, address indexed caller);
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
    error IncorrectFee();
    error FeeNotConfigured();
    error EthTransferFailed();

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
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Set the creation fee for `(feeToken, airdropType)`. `feeToken == ETH (address(0))`
    ///         prices the native-ETH payment option.
    function setFee(address feeToken, uint8 airdropType, uint256 amount) external onlyOwner {
        AirdropType t = _toType(airdropType);
        // Reject a non-contract ERC20 fee token up front (the ETH sentinel is exempt), so a
        // misconfiguration fails here with NotAContract rather than opaquely inside createDrop.
        if (feeToken != ETH) _requireContract(feeToken);
        _feeOf[feeToken][t] = amount;
        emit FeeUpdated(feeToken, t, amount);
    }

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

    /// @notice Withdraw accrued fees of `token` (`ETH` for native) to the fixed `treasury`.
    function withdrawFees(address token, uint256 amount) external onlyOwner {
        uint256 collected = collectedFees[token];
        if (amount > collected) revert InsufficientCollectedFees();
        // Skip the state write + transfer for a zero withdrawal: some ERC20s revert
        // on zero-value transfers, and emitting FeesWithdrawn(0) would be noise.
        if (amount > 0) {
            unchecked {
                collectedFees[token] = collected - amount;
            }
            address to = treasury;
            if (token == ETH) {
                (bool ok,) = payable(to).call{ value: amount }("");
                if (!ok) revert EthTransferFailed();
            } else {
                IERC20(token).safeTransfer(to, amount);
            }
            emit FeesWithdrawn(token, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Token registry
    // ---------------------------------------------------------------------

    /// @notice Permissionlessly register `token` as a `COMMUNITY` airdrop token.
    /// @dev Gated by operator verification (gate 1) and a contract check. Idempotent:
    ///      an already-registered token keeps its tier (never downgrades `OFFICIAL`).
    function addAllowedToken(address token) external {
        // Already-registered tokens are a no-op, so skip the (cheaper) contract check and the
        // external operator-verification call entirely. Cheapest guard first within the block.
        if (tokenTier[token] == TokenTier.NONE) {
            _requireContract(token);
            _requireVerifiedOperator();
            tokenTier[token] = TokenTier.COMMUNITY;
            emit AllowedTokenSet(token, TokenTier.COMMUNITY, msg.sender);
        }
    }

    /// @notice Admin curation of `OFFICIAL` tokens. `official = true` marks `token`
    ///         `OFFICIAL` (requires a contract); `false` demotes an `OFFICIAL` token back
    ///         to `COMMUNITY` (still allowed) and is a no-op otherwise. Use
    ///         `removeAllowedToken` to fully de-register.
    function setOfficialToken(address token, bool official) external onlyOwner {
        if (official) {
            if (tokenTier[token] != TokenTier.OFFICIAL) {
                _requireContract(token);
                tokenTier[token] = TokenTier.OFFICIAL;
                emit AllowedTokenSet(token, TokenTier.OFFICIAL, msg.sender);
            }
        } else if (tokenTier[token] == TokenTier.OFFICIAL) {
            tokenTier[token] = TokenTier.COMMUNITY;
            emit AllowedTokenSet(token, TokenTier.COMMUNITY, msg.sender);
        }
    }

    /// @notice Admin removal: de-register `token` entirely (`tier = NONE`).
    function removeAllowedToken(address token) external onlyOwner {
        if (tokenTier[token] != TokenTier.NONE) {
            tokenTier[token] = TokenTier.NONE;
            emit AllowedTokenSet(token, TokenTier.NONE, msg.sender);
        }
    }

    /// @notice True if `token` is registered at any tier (`COMMUNITY` or `OFFICIAL`).
    function isAllowed(address token) external view returns (bool) {
        return tokenTier[token] != TokenTier.NONE;
    }

    // ---------------------------------------------------------------------
    // Campaign creation
    // ---------------------------------------------------------------------

    /// @notice Create an identity-gated Merkle airdrop campaign.
    /// @dev Ordering: cheap checks → gate 1 → registry → token allow-list → collect fee →
    ///      deploy drop → fund drop.
    /// @param airdropType      Distribution type (must be a valid `AirdropType`).
    /// @param airdropToken     ERC20 distributed to claimers (must be registered, `tier != NONE`).
    /// @param merkleRoot       Root over `keccak256(abi.encodePacked(index, account, amount))` leaves.
    /// @param totalAmount      Total `airdropToken` funded into the drop.
    /// @param startTime        Unix time at/after which claims open (may be now or future).
    /// @param deadline         Unix time after which claims close and the operator may sweep;
    ///                         must be in the future and at least `MIN_DURATION` after `startTime`.
    /// @param identityRegistry zk-X509 IdentityRegistry gating claimers (gate 2).
    /// @param feeToken         Token used to pay the creation fee; `ETH (address(0))` = native ETH
    ///                         (send the fee as `msg.value`), otherwise send no ETH and the ERC20
    ///                         fee is pulled from the caller.
    /// @return drop            Address of the deployed MerkleDrop.
    function createDrop(
        uint8 airdropType,
        address airdropToken,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 startTime,
        uint64 deadline,
        address identityRegistry,
        address feeToken
    ) external payable returns (address drop) {
        AirdropType t = _toType(airdropType);
        // Validate the cheap in-memory args (incl. zero registry) before any external call.
        if (airdropToken == address(0) || identityRegistry == address(0)) revert InvalidAddress();
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (totalAmount == 0) revert ZeroTotalAmount();
        // Claim window: deadline must be in the future and open before it closes.
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (startTime >= deadline) revert InvalidWindow();
        // Enforce MIN_DURATION on the *effective* (claimable-from-now) window: a
        // past startTime must not let a near-instant deadline slip through, since
        // claims can only ever start at `block.timestamp` at the earliest.
        uint256 effectiveStart = startTime < block.timestamp ? block.timestamp : startTime;
        if (deadline - effectiveStart < MIN_DURATION) revert InvalidWindow();
        // The airdrop token must be a real contract; identityRegistry's authenticity is
        // enforced below by zkFactory.isRegistry (a genuine registry is itself a contract).
        _requireContract(airdropToken);

        // Gate 1: campaign creator must be a verified operator.
        _requireVerifiedOperator();
        // Customer registry must be a genuine zk-X509 IdentityRegistry.
        if (!zkFactory.isRegistry(identityRegistry)) revert NotAStandardRegistry();
        // The airdrop token must be registered (community-added or admin-official).
        if (tokenTier[airdropToken] == TokenTier.NONE) revert TokenNotAllowed();

        // Collect the creation fee in `feeToken` (ETH for native). CEI: credit before any pull.
        uint256 fee = _feeOf[feeToken][t];
        if (feeToken == ETH) {
            // Symmetric with the ERC20 branch: an unpriced (fee == 0) tier is not a free tier —
            // it is simply not accepted, so a missing ETH price can't be used to bypass the
            // configured ERC20 price for the same airdrop type.
            if (fee == 0) revert FeeNotConfigured();
            if (msg.value != fee) revert IncorrectFee();
            collectedFees[ETH] += fee;
        } else {
            if (msg.value != 0) revert IncorrectFee();
            if (fee == 0) revert FeeNotConfigured();
            collectedFees[feeToken] += fee;
            _pullExact(IERC20(feeToken), msg.sender, address(this), fee);
        }

        // Deploy the drop (operator = msg.sender, factory = this via MerkleDrop's msg.sender).
        // MerkleDrop takes solmate ERC20 / IIdentityRegistry types; wrap the raw addresses.
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

        // Fund the drop with the airdrop tokens; require exact receipt so a fee-on-transfer
        // or rebasing token cannot under-fund the campaign and DoS later claimers.
        _pullExact(IERC20(airdropToken), msg.sender, drop, totalAmount);

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

    /// @notice Creation fee for `(feeToken, airdropType)` (`ETH` for native).
    function feeOf(address feeToken, uint8 airdropType) external view returns (uint256) {
        return _feeOf[feeToken][_toType(airdropType)];
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
        // unchecked so a token whose `to` balance fails to increase by `amount` (rebasing or
        // malicious balanceOf) reverts with IncorrectAmountReceived rather than an arithmetic panic.
        unchecked {
            if (token.balanceOf(to) - balBefore != amount) revert IncorrectAmountReceived();
        }
    }
}
