// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title LiveStreamContent
 * @dev Smart contract for registering and managing live stream content ownership
 */
contract LiveStreamContent is ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using Strings for uint256;

    Counters.Counter private _tokenIds;
    Counters.Counter private _contentIds;

    // Content registry
    struct Content {
        string contentId;     // IPFS CID or other unique identifier
        address owner;        // Content owner address
        string title;         // Content title
        string description;   // Content description
        uint256 timestamp;    // Registration timestamp
        uint256 tokenId;      // Associated NFT token ID (0 if no NFT minted)
        bool exists;          // Flag to check if content exists
    }

    // Creator profile
    struct Creator {
        address creatorAddress;
        string name;
        string bio;
        string profileImageUri;
        uint256 contentCount;
        uint256 totalTips;
        bool verified;
    }

    // Tipping record
    struct Tip {
        address sender;
        address recipient;
        uint256 amount;
        uint256 timestamp;
        string message;
        string contentId; // If tip is for specific content
    }

    // Mappings
    mapping(uint256 => Content) private _contents;
    mapping(string => uint256) private _contentIdToIndex;
    mapping(address => Creator) private _creators;
    mapping(address => Tip[]) private _creatorTips;
    mapping(string => uint256) private _contentToNFT;

    // Platform fee settings
    uint256 public platformFeePercent = 5; // 5% fee
    address public platformWallet;

    // Events
    event ContentRegistered(uint256 indexed id, string contentId, address indexed owner, uint256 timestamp);
    event CreatorTipped(address indexed creator, address indexed tipper, uint256 amount, string message, string contentId);
    event NFTMinted(uint256 indexed tokenId, string contentId, address indexed owner);
    event CreatorRegistered(address indexed creatorAddress, string name);
    event ContentVerified(string contentId, address verifier, uint256 timestamp);

    /**
     * @dev Constructor
     * @param platformWalletAddress Address to receive platform fees
     */
    constructor(address platformWalletAddress) ERC721("LiveVideo Content NFT", "LVNFT") Ownable(msg.sender) {
        platformWallet = platformWalletAddress;
    }

    /**
     * @dev Register new content
     * @param contentId IPFS CID or unique identifier for the content
     * @param title Content title
     * @param description Content description
     * @return Content ID number
     */
    function registerContent(
        string memory contentId, 
        string memory title, 
        string memory description
    ) public returns (uint256) {
        require(bytes(contentId).length > 0, "Content ID cannot be empty");
        require(_contentIdToIndex[contentId] == 0, "Content ID already registered");

        _contentIds.increment();
        uint256 newContentIndex = _contentIds.current();
        
        _contents[newContentIndex] = Content({
            contentId: contentId,
            owner: msg.sender,
            title: title,
            description: description,
            timestamp: block.timestamp,
            tokenId: 0,
            exists: true
        });

        _contentIdToIndex[contentId] = newContentIndex;

        // Update creator content count if creator exists
        if (_creators[msg.sender].creatorAddress == msg.sender) {
            _creators[msg.sender].contentCount++;
        }

        emit ContentRegistered(newContentIndex, contentId, msg.sender, block.timestamp);
        return newContentIndex;
    }

    /**
     * @dev Get content details by ID
     * @param id Content ID number
     * @return Content details
     */
    function getContent(uint256 id) public view returns (
        string memory contentId,
        address owner,
        string memory title,
        string memory description,
        uint256 timestamp,
        uint256 tokenId
    ) {
        require(_contents[id].exists, "Content does not exist");
        Content storage content = _contents[id];
        return (
            content.contentId,
            content.owner,
            content.title,
            content.description,
            content.timestamp,
            content.tokenId
        );
    }

    /**
     * @dev Get content by content ID string
     * @param contentId Content ID string
     * @return Content details
     */
    function getContentByContentId(string memory contentId) public view returns (
        address owner,
        string memory title,
        string memory description,
        uint256 timestamp,
        uint256 tokenId
    ) {
        uint256 id = _contentIdToIndex[contentId];
        require(id > 0, "Content does not exist");
        Content storage content = _contents[id];
        return (
            content.owner,
            content.title,
            content.description,
            content.timestamp,
            content.tokenId
        );
    }

    /**
     * @dev Verify if a signature was signed by the claimed owner of content
     * @param contentId Content ID
     * @param claimedOwner Address claiming to be the owner
     * @param signature Signature to verify
     * @return Whether the signature is valid
     */
    function verifyContentSignature(
        string memory contentId,
        address claimedOwner,
        bytes memory signature
    ) public view returns (bool) {
        uint256 id = _contentIdToIndex[contentId];
        require(id > 0, "Content does not exist");
        Content storage content = _contents[id];

        // Verify the content owner
        require(content.owner == claimedOwner, "Claimed owner is not the actual owner");

        // Recreate the message that was signed
        bytes32 messageHash = keccak256(abi.encodePacked(
            contentId,
            claimedOwner,
            content.title,
            content.description,
            content.timestamp
        ));

        // Verify the signature
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        address recoveredSigner = ecrecover(ethSignedMessageHash, v, r, s);
        
        return recoveredSigner == claimedOwner;
    }

    /**
     * @dev Split signature into r, s, v components
     * @param sig Signature bytes
     */
    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // Adjust v value for non-Ethereum chains
        if (v < 27) {
            v += 27;
        }

        return (r, s, v);
    }

    /**
     * @dev Send a tip to a content creator
     * @param creator Creator address
     * @param message Optional message
     * @param contentId Optional content ID
     */
    function tipCreator(
        address creator, 
        string memory message, 
        string memory contentId
    ) public payable nonReentrant {
        require(creator != address(0), "Invalid creator address");
        require(msg.value > 0, "Tip amount must be greater than 0");

        // Calculate platform fee
        uint256 platformFee = (msg.value * platformFeePercent) / 100;
        uint256 creatorAmount = msg.value - platformFee;

        // Transfer platform fee
        if (platformFee > 0) {
            (bool feeSuccess, ) = platformWallet.call{value: platformFee}("");
            require(feeSuccess, "Platform fee transfer failed");
        }

        // Transfer tip to creator
        (bool success, ) = creator.call{value: creatorAmount}("");
        require(success, "Tip transfer failed");

        // Record the tip
        _creatorTips[creator].push(Tip({
            sender: msg.sender,
            recipient: creator,
            amount: msg.value,
            timestamp: block.timestamp,
            message: message,
            contentId: contentId
        }));

        // Update creator's total tips if they exist
        if (_creators[creator].creatorAddress == creator) {
            _creators[creator].totalTips += msg.value;
        }

        emit CreatorTipped(creator, msg.sender, msg.value, message, contentId);
    }

    /**
     * @dev Mint an NFT for registered content
     * @param contentId Content ID
     * @param metadataURI URI for the NFT metadata
     * @return ID of the minted NFT
     */
    function mintNFT(
        string memory contentId,
        string memory metadataURI
    ) public returns (uint256) {
        uint256 id = _contentIdToIndex[contentId];
        require(id > 0, "Content does not exist");
        
        Content storage content = _contents[id];
        require(content.owner == msg.sender, "Only content owner can mint NFT");
        require(content.tokenId == 0, "NFT already minted for this content");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _mint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, metadataURI);

        // Update content with token ID
        content.tokenId = newTokenId;
        _contentToNFT[contentId] = newTokenId;

        emit NFTMinted(newTokenId, contentId, msg.sender);
        return newTokenId;
    }

    /**
     * @dev Get token ID for a content
     * @param contentId Content ID
     * @return Token ID (0 if not minted)
     */
    function contentToNFT(string memory contentId) public view returns (uint256) {
        return _contentToNFT[contentId];
    }

    /**
     * @dev Register or update creator profile
     * @param name Creator name
     * @param bio Creator bio
     * @param profileImageUri Creator profile image URI
     */
    function registerCreator(
        string memory name,
        string memory bio,
        string memory profileImageUri
    ) public {
        require(bytes(name).length > 0, "Name cannot be empty");

        // Create or update creator profile
        _creators[msg.sender] = Creator({
            creatorAddress: msg.sender,
            name: name,
            bio: bio,
            profileImageUri: profileImageUri,
            contentCount: _creators[msg.sender].contentCount,
            totalTips: _creators[msg.sender].totalTips,
            verified: _creators[msg.sender].verified
        });

        emit CreatorRegistered(msg.sender, name);
    }

    /**
     * @dev Get creator profile
     * @param creatorAddress Creator address
     * @return Creator details
     */
    function getCreator(address creatorAddress) public view returns (
        string memory name,
        string memory bio,
        string memory profileImageUri,
        uint256 contentCount,
        uint256 totalTips,
        bool verified
    ) {
        Creator storage creator = _creators[creatorAddress];
        require(creator.creatorAddress == creatorAddress, "Creator does not exist");
        
        return (
            creator.name,
            creator.bio,
            creator.profileImageUri,
            creator.contentCount,
            creator.totalTips,
            creator.verified
        );
    }

    /**
     * @dev Verify a creator (only contract owner can do this)
     * @param creatorAddress Creator address to verify
     */
    function verifyCreator(address creatorAddress) public onlyOwner {
        require(_creators[creatorAddress].creatorAddress == creatorAddress, "Creator does not exist");
        _creators[creatorAddress].verified = true;
    }

    /**
     * @dev Set platform fee percentage
     * @param newFeePercent New fee percent (0-20)
     */
    function setPlatformFeePercent(uint256 newFeePercent) public onlyOwner {
        require(newFeePercent <= 20, "Fee percentage too high");
        platformFeePercent = newFeePercent;
    }

    /**
     * @dev Set platform wallet address
     * @param newWallet New wallet address
     */
    function setPlatformWallet(address newWallet) public onlyOwner {
        require(newWallet != address(0), "Invalid address");
        platformWallet = newWallet;
    }

    /**
     * @dev Get tips for a creator
     * @param creator Creator address
     * @param offset Pagination offset
     * @param limit Pagination limit
     * @return Array of tips
     */
    function getCreatorTips(
        address creator, 
        uint256 offset, 
        uint256 limit
    ) public view returns (
        address[] memory senders,
        uint256[] memory amounts,
        uint256[] memory timestamps,
        string[] memory messages,
        string[] memory contentIds
    ) {
        Tip[] storage tips = _creatorTips[creator];
        
        // Calculate actual length based on pagination
        uint256 resultLength = tips.length - offset;
        if (resultLength > limit) {
            resultLength = limit;
        }
        if (offset >= tips.length) {
            resultLength = 0;
        }
        
        // Initialize return arrays
        senders = new address[](resultLength);
        amounts = new uint256[](resultLength);
        timestamps = new uint256[](resultLength);
        messages = new string[](resultLength);
        contentIds = new string[](resultLength);
        
        // Populate return arrays
        for (uint256 i = 0; i < resultLength; i++) {
            Tip storage tip = tips[offset + i];
            senders[i] = tip.sender;
            amounts[i] = tip.amount;
            timestamps[i] = tip.timestamp;
            messages[i] = tip.message;
            contentIds[i] = tip.contentId;
        }
        
        return (senders, amounts, timestamps, messages, contentIds);
    }
}
