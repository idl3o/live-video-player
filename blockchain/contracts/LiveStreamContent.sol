// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LiveStreamContent
 * @notice Minimal on-chain registry that anchors a stream recording's
 *         content identifier (IPFS / Filecoin CID) to its claimed creator.
 *
 * @dev Intentionally narrow. This is the *registry* layer of the stack —
 *      tipping happens via direct ERC20 transfers, reputation lives in EAS
 *      attestations, NFT minting is out of scope. Anyone can call
 *      `registerContent` once per CID; the first writer wins and is
 *      recorded as the canonical creator. The contract holds no funds,
 *      has no admin, and is not upgradeable.
 */
contract LiveStreamContent {
    struct Content {
        address creator;
        uint64 registeredAt;
        string title;
    }

    mapping(string => Content) private _contents;

    event ContentRegistered(
        string indexed contentCidIndexed, // for filtering by hashed CID
        string contentCid,                // raw CID, available in event data
        address indexed creator,
        uint64 registeredAt,
        string title
    );

    error AlreadyRegistered(string contentCid, address existingCreator);
    error EmptyContentCid();

    /**
     * @notice Anchor a CID to msg.sender. Reverts if already registered.
     * @param contentCid The IPFS/Filecoin CID of the recording.
     * @param title Human-readable title. Stored as-is.
     */
    function registerContent(string calldata contentCid, string calldata title) external {
        if (bytes(contentCid).length == 0) revert EmptyContentCid();
        Content storage existing = _contents[contentCid];
        if (existing.creator != address(0)) {
            revert AlreadyRegistered(contentCid, existing.creator);
        }
        _contents[contentCid] = Content({
            creator: msg.sender,
            registeredAt: uint64(block.timestamp),
            title: title
        });
        emit ContentRegistered(contentCid, contentCid, msg.sender, uint64(block.timestamp), title);
    }

    /**
     * @notice Look up the registration for a CID.
     * @return creator The address that registered the CID, or address(0) if none.
     * @return registeredAt UNIX timestamp of registration.
     * @return title Stored title string.
     */
    function getContent(string calldata contentCid)
        external
        view
        returns (address creator, uint64 registeredAt, string memory title)
    {
        Content storage c = _contents[contentCid];
        return (c.creator, c.registeredAt, c.title);
    }

    /**
     * @notice Convenience predicate.
     */
    function isRegistered(string calldata contentCid) external view returns (bool) {
        return _contents[contentCid].creator != address(0);
    }
}
