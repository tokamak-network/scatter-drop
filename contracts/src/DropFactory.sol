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
///         Each `createDrop` deploys a `MerkleDrop`, charging a per-type creation
///         fee into the fee vault and funding the drop with the airdrop tokens.
/// @dev    Two identity gates (DEV-PLAN §2.2):
///         - Gate 1 (here): the operator (campaign creator) must be verified against the
///           global `operatorRegistry`.
///         - Gate 2 (in MerkleDrop): each claimer must be verified against the campaign's
///           customer `identityRegistry`.
///         Fees accrue in `collectedFees[feeToken]` and are withdrawable only to the
///         fixed `treasury` (no arbitrary recipient — K0 decision §5).
///         Trust model and the W13 audit summary live in `docs/SECURITY.md`. Supported fee
///         and airdrop tokens are standard ERC20; fee-on-transfer (and any non-exact transfer)
///         is rejected at creation by the exact-receipt guard (`_pullExact`). Standard rebasing
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

    /// @notice Minimum lead time between campaign creation and its deadline. Prevents a
    ///         publish-and-instantly-sweep campaign that would mislead would-be claimers.
    uint256 public constant MIN_DURATION = 1 hours;

    /// @notice ERC20 used to pay creation fees.
    IERC20 public feeToken;

    /// @notice zk-X509 IdentityRegistry that gates who may create campaigns (gate 1).
    address public operatorRegistry;

    /// @notice zk-X509 RegistryFactory used to validate customer registries passed to `createDrop`.
    IRegistryFactoryLike public zkFactory;

    /// @notice Fixed destination for fee withdrawals. Fees can never leave to an arbitrary address.
    address public treasury;

    /// @notice Creation fee per airdrop type, denominated in `feeToken`.
    mapping(AirdropType => uint256) private _feeOf;

    /// @notice Total fees accrued and not yet withdrawn, per token. Keyed by token to remain
    ///         correct across `setFeeToken` changes.
    mapping(address => uint256) public collectedFees;

    /// @notice Every MerkleDrop deployed by this factory, in creation order.
    address[] private _drops;

    event FeeTokenUpdated(address indexed feeToken);
    event OperatorRegistryUpdated(address indexed operatorRegistry);
    event ZkFactoryUpdated(address indexed zkFactory);
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(AirdropType indexed airdropType, uint256 amount);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event DropCreated(
        address indexed drop,
        address indexed operator,
        AirdropType indexed airdropType,
        address airdropToken,
        address identityRegistry,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 deadline,
        uint256 fee
    );

    error InvalidAddress();
    error InvalidAirdropType();
    error OperatorNotVerified();
    error NotAStandardRegistry();
    error InvalidDeadline();
    error ZeroTotalAmount();
    error InvalidMerkleRoot();
    error FeeTokenNotSet();
    error InsufficientCollectedFees();
    error NotAContract();
    error IncorrectAmountReceived();

    /// @param initialOwner       Admin (can set fees, registries, treasury, and withdraw).
    /// @param feeToken_          ERC20 charged on `createDrop`. May be zero only if all fees are 0.
    /// @param operatorRegistry_  zk-X509 IdentityRegistry gating campaign creators (gate 1).
    /// @param zkFactory_         zk-X509 RegistryFactory validating customer registries.
    /// @param treasury_          Fixed fee-withdrawal destination.
    constructor(
        address initialOwner,
        IERC20 feeToken_,
        address operatorRegistry_,
        IRegistryFactoryLike zkFactory_,
        address treasury_
    ) Ownable(initialOwner) {
        if (operatorRegistry_ == address(0) || address(zkFactory_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }
        _requireContract(operatorRegistry_);
        _requireContract(address(zkFactory_));
        if (address(feeToken_) != address(0)) _requireContract(address(feeToken_));
        feeToken = feeToken_;
        operatorRegistry = operatorRegistry_;
        zkFactory = zkFactory_;
        treasury = treasury_;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Set the per-type creation fee (denominated in the current `feeToken`).
    function setFee(uint8 airdropType, uint256 amount) external onlyOwner {
        AirdropType t = _toType(airdropType);
        _feeOf[t] = amount;
        emit FeeUpdated(t, amount);
    }

    /// @notice Change the fee token. Past accruals stay keyed by their original token.
    function setFeeToken(IERC20 feeToken_) external onlyOwner {
        // Allow address(0) (only valid when all fees are 0); otherwise require a contract.
        if (address(feeToken_) != address(0)) _requireContract(address(feeToken_));
        feeToken = feeToken_;
        emit FeeTokenUpdated(address(feeToken_));
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

    /// @notice Withdraw accrued fees of `token` to the fixed `treasury`.
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
            IERC20(token).safeTransfer(to, amount);
            emit FeesWithdrawn(token, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Campaign creation
    // ---------------------------------------------------------------------

    /// @notice Create an identity-gated Merkle airdrop campaign.
    /// @dev Effects/interactions ordering: gate checks → pull fee → deploy drop → fund drop.
    /// @param airdropType      Distribution type (must be a valid `AirdropType`).
    /// @param airdropToken     ERC20 distributed to claimers.
    /// @param merkleRoot       Root over `keccak256(abi.encodePacked(index, account, amount))` leaves.
    /// @param totalAmount      Total `airdropToken` funded into the drop.
    /// @param deadline         Unix time after which claims close and the operator may sweep;
    ///                         must be at least `MIN_DURATION` in the future.
    /// @param identityRegistry zk-X509 IdentityRegistry gating claimers (gate 2).
    /// @return drop            Address of the deployed MerkleDrop.
    function createDrop(
        uint8 airdropType,
        address airdropToken,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 deadline,
        address identityRegistry
    ) external returns (address drop) {
        AirdropType t = _toType(airdropType);
        // Validate the cheap in-memory args (incl. zero registry) before any external call.
        if (airdropToken == address(0) || identityRegistry == address(0)) revert InvalidAddress();
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (totalAmount == 0) revert ZeroTotalAmount();
        if (deadline < block.timestamp + MIN_DURATION) revert InvalidDeadline();
        // The airdrop token must be a real contract; identityRegistry's authenticity is
        // enforced below by zkFactory.isRegistry (a genuine registry is itself a contract).
        _requireContract(airdropToken);

        // Gate 1: campaign creator must be a verified operator.
        if (IIdentityRegistry(operatorRegistry).verifiedUntil(msg.sender) < block.timestamp) {
            revert OperatorNotVerified();
        }
        // Customer registry must be a genuine zk-X509 IdentityRegistry.
        if (!zkFactory.isRegistry(identityRegistry)) revert NotAStandardRegistry();

        // Pull the creation fee into the vault.
        uint256 fee = _feeOf[t];
        if (fee > 0) {
            IERC20 token = feeToken;
            if (address(token) == address(0)) revert FeeTokenNotSet();
            // CEI: account for the fee before the external pull.
            collectedFees[address(token)] += fee;
            _pullExact(token, msg.sender, address(this), fee);
        }

        // Deploy the drop (operator = msg.sender, factory = this via MerkleDrop's msg.sender).
        // MerkleDrop takes solmate ERC20 / IIdentityRegistry types; wrap the raw addresses.
        drop = address(
            new MerkleDrop(
                ERC20(airdropToken), merkleRoot, deadline, IIdentityRegistry(identityRegistry), msg.sender
            )
        );
        _drops.push(drop);

        // Fund the drop with the airdrop tokens; require exact receipt so a fee-on-transfer
        // or rebasing token cannot under-fund the campaign and DoS later claimers.
        _pullExact(IERC20(airdropToken), msg.sender, drop, totalAmount);

        emit DropCreated(
            drop, msg.sender, t, airdropToken, identityRegistry, merkleRoot, totalAmount, deadline, fee
        );
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Current creation fee for `airdropType`.
    function feeOf(uint8 airdropType) external view returns (uint256) {
        return _feeOf[_toType(airdropType)];
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
