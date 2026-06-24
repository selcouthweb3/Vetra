// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VetraConsumer {
    // ── Precompile addresses ──────────────────────────────────────────────────
    address constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address constant LLM_PRECOMPILE  = 0x0000000000000000000000000000000000000802;
    address constant JQ_PRECOMPILE   = 0x0000000000000000000000000000000000000803;

    // ── Constants ─────────────────────────────────────────────────────────────
    string constant ETH_RPC   = "https://ethereum.publicnode.com";
    string constant LLM_MODEL = "zai-org/GLM-4.7-FP8";

    // ── Storage types ─────────────────────────────────────────────────────────
    struct AddressData {
        string balanceHex;
        string txCountHex;
        bool   fetched;
    }

    struct CachedResult {
        bytes   rawOutput;
        uint256 cachedAt;        // block number
        uint256 cachedAtTime;    // block.timestamp (unix seconds)
        address requestedBy;     // EOA that called analyzeReputation
        bool    exists;
    }

    // StorageRef tuple required by LLM precompile field 29
    struct StorageRef {
        string platform;
        string path;
        string keyRef;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    address public immutable owner;
    uint256 public totalAnalyzed;

    mapping(address => AddressData)  public addressData;
    mapping(address => CachedResult) private _results;

    // ── Events ────────────────────────────────────────────────────────────────
    event DataFetched(address indexed target, string balanceHex, string txCountHex);
    event ReputationAnalyzed(address indexed target, uint256 blockNumber, address indexed requestedBy);
    event CacheCleared(address indexed target);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ── Read helpers ──────────────────────────────────────────────────────────

    function isCached(address target) external view returns (bool) {
        return _results[target].exists;
    }

    function getResult(address target) external view returns (
        bytes memory rawOutput,
        uint256 cachedAt,
        uint256 cachedAtTime,
        address requestedBy,
        bool    exists
    ) {
        CachedResult storage r = _results[target];
        return (r.rawOutput, r.cachedAt, r.cachedAtTime, r.requestedBy, r.exists);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function clearCache(address target) external onlyOwner {
        delete _results[target];
        delete addressData[target];
        emit CacheCleared(target);
    }

    // ── TX1: fetch on-chain data via HTTP + JQ ────────────────────────────────
    //
    // Sends a batch JSON-RPC request to publicnode.com for balance + tx count.
    // JQ (synchronous) parses the response during fulfilled replay.
    // TTL recommendation: 300 blocks.
    function fetchData(address target, address executor, uint256 ttl) external {
        string memory addrStr = _addrToString(target);

        string[] memory hk = new string[](1);
        string[] memory hv = new string[](1);
        hk[0] = "Content-Type";
        hv[0] = "application/json";

        bytes memory body = bytes(string.concat(
            '[{"jsonrpc":"2.0","method":"eth_getBalance","params":["',
            addrStr, '","latest"],"id":1},',
            '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["',
            addrStr, '","latest"],"id":2}]'
        ));

        (bool ok, bytes memory raw) = address(HTTP_PRECOMPILE).call(
            abi.encode(
                executor, new bytes[](0), ttl, new bytes[](0), bytes(""),
                ETH_RPC, uint8(2), hk, hv, body, uint256(0), uint8(0), false
            )
        );
        require(ok, "HTTP precompile call failed");

        // raw.length == 0 during builder simulation — fulfilled replay has the result
        if (raw.length == 0) return;

        (, bytes memory actual) = abi.decode(raw, (bytes, bytes));
        (uint16 status, , , bytes memory respBody, string memory errMsg) =
            abi.decode(actual, (uint16, string[], string[], bytes, string));

        if (status != 200 || bytes(errMsg).length > 0) return;

        string memory bodyStr = string(respBody);

        (bool ok1, bytes memory r1) = address(JQ_PRECOMPILE).staticcall(
            abi.encode(".[0].result", bodyStr, uint8(2))
        );
        (bool ok2, bytes memory r2) = address(JQ_PRECOMPILE).staticcall(
            abi.encode(".[1].result", bodyStr, uint8(2))
        );

        if (!ok1 || !ok2 || r1.length < 96 || r2.length < 96) return;

        string memory balHex = _decodeJQString(r1);
        string memory txHex  = _decodeJQString(r2);

        addressData[target] = AddressData(balHex, txHex, true);
        emit DataFetched(target, balHex, txHex);
    }

    // ── TX2: score the address via LLM ────────────────────────────────────────
    //
    // Reads stored AddressData, converts hex→human-readable values, then feeds
    // to the LLM precompile. Raw actualOutput stored on-chain for client decoding.
    // TTL recommendation: 300 blocks. maxCompletionTokens must be >= 4096.
    function analyzeReputation(address target, address executor, uint256 ttl) external {
        require(addressData[target].fetched, "fetchData required first");

        AddressData memory d = addressData[target];

        // Convert hex → human-readable for better LLM scoring accuracy
        uint256 balWei  = _parseHex(d.balanceHex);
        uint256 txCount = _parseHex(d.txCountHex);
        string memory balEth = _weiToEth(balWei);
        string memory txStr  = _uint256ToString(txCount);

        string memory messages = string.concat(
            '[{"role":"user","content":"Analyze this Ethereum address and score its suspiciousness. '
            'Address: ', _addrToString(target),
            '. ETH balance: ', balEth,
            '. Transaction count: ', txStr,
            '. Respond ONLY with valid JSON (no markdown, no explanation, no code block): '
            '{\\\"score\\\":42,\\\"reason\\\":\\\"one sentence reason\\\"}. '
            'Score is 0-100 where 0=fully trustworthy and 100=extremely high risk."}]'
        );

        (bool ok, bytes memory raw) = address(LLM_PRECOMPILE).call(
            _buildLLMPayload(executor, ttl, messages)
        );
        require(ok, "LLM precompile call failed");

        if (raw.length == 0) return;

        (, bytes memory actual) = abi.decode(raw, (bytes, bytes));

        _results[target] = CachedResult(actual, block.number, block.timestamp, msg.sender, true);
        totalAnalyzed++;
        emit ReputationAnalyzed(target, block.number, msg.sender);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _buildLLMPayload(
        address executor,
        uint256 ttl,
        string memory messages
    ) internal pure returns (bytes memory) {
        StorageRef memory emptyRef = StorageRef("", "", "");
        return abi.encode(
            executor,          // 0  executor
            new bytes[](0),    // 1  encryptedSecrets
            ttl,               // 2  ttl
            new bytes[](0),    // 3  secretSignatures
            bytes(""),         // 4  userPublicKey
            messages,          // 5  messagesJson
            LLM_MODEL,         // 6  model
            int256(0),         // 7  frequencyPenalty (×1000)
            "",                // 8  logitBiasJson
            false,             // 9  logprobs
            int256(4096),      // 10 maxCompletionTokens (≥4096 for GLM-4.7-FP8 reasoning)
            "",                // 11 metadataJson
            "",                // 12 modalitiesJson
            uint256(1),        // 13 n
            true,              // 14 parallelToolCalls (ABI placeholder)
            int256(0),         // 15 presencePenalty (×1000)
            "medium",          // 16 reasoningEffort
            bytes(""),         // 17 responseFormatData
            int256(-1),        // 18 seed
            "",                // 19 serviceTier
            "",                // 20 stopJson
            false,             // 21 stream
            int256(700),       // 22 temperature (0.7 × 1000)
            bytes(""),         // 23 toolChoiceData
            bytes(""),         // 24 toolsData
            int256(-1),        // 25 topLogprobs
            int256(1000),      // 26 topP (1.0 × 1000)
            "",                // 27 user
            false,             // 28 piiEnabled
            emptyRef           // 29 convoHistory StorageRef("","","")
        );
    }

    // JQ type-2 (string) output: abi.encode(bool ok, string result).
    // strLen is at data[64-95], string bytes start at data[96].
    function _decodeJQString(bytes memory raw) internal pure returns (string memory) {
        require(raw.length >= 96, "JQ: output too short");
        uint256 strLen;
        assembly { strLen := mload(add(raw, 96)) }
        bytes memory result = new bytes(strLen);
        for (uint256 i = 0; i < strLen; i++) {
            result[i] = raw[96 + i];
        }
        return string(result);
    }

    // Parse a "0x..." hex string to uint256.
    function _parseHex(string memory hexStr) internal pure returns (uint256 result) {
        bytes memory b = bytes(hexStr);
        uint256 start = (b.length >= 2 && b[0] == '0' && (b[1] == 'x' || b[1] == 'X')) ? 2 : 0;
        for (uint256 i = start; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            uint8 digit;
            if      (c >= 0x30 && c <= 0x39) digit = c - 0x30;
            else if (c >= 0x61 && c <= 0x66) digit = c - 0x61 + 10;
            else if (c >= 0x41 && c <= 0x46) digit = c - 0x41 + 10;
            else break;
            result = result * 16 + digit;
        }
    }

    // uint256 → decimal string.
    function _uint256ToString(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 temp = n;
        uint256 len;
        while (temp > 0) { len++; temp /= 10; }
        bytes memory buf = new bytes(len);
        uint256 idx = len;
        while (n > 0) { buf[--idx] = bytes1(uint8(48 + n % 10)); n /= 10; }
        return string(buf);
    }

    // wei → "X.XXXX ETH" (4 decimal places, precision = 0.0001 ETH).
    function _weiToEth(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1e18;
        uint256 frac  = (wei_ % 1e18) / 1e14;
        return string.concat(
            _uint256ToString(whole), ".", _padLeft(_uint256ToString(frac), 4), " ETH"
        );
    }

    // Left-pad string with '0's to totalLen.
    function _padLeft(string memory s, uint256 totalLen) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        if (b.length >= totalLen) return s;
        uint256 padLen = totalLen - b.length;
        bytes memory padded = new bytes(totalLen);
        for (uint256 i = 0; i < padLen; i++) padded[i] = '0';
        for (uint256 i = 0; i < b.length; i++) padded[padLen + i] = b[i];
        return string(padded);
    }

    // Converts an address to its lowercase "0x..." hex string.
    function _addrToString(address addr) internal pure returns (string memory) {
        bytes memory alpha = "0123456789abcdef";
        bytes memory data  = abi.encodePacked(addr);
        bytes memory buf   = new bytes(42);
        buf[0] = "0";
        buf[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            buf[2 + i * 2]     = alpha[uint8(data[i] >> 4)];
            buf[3 + i * 2]     = alpha[uint8(data[i] & 0x0f)];
        }
        return string(buf);
    }
}
