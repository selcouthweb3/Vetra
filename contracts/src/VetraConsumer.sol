// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VetraConsumer {
    // ── Precompile addresses ──────────────────────────────────────────────────
    address constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address constant LLM_PRECOMPILE  = 0x0000000000000000000000000000000000000802;
    address constant JQ_PRECOMPILE   = 0x0000000000000000000000000000000000000803;

    // ── Constants ─────────────────────────────────────────────────────────────
    // Public JSON-RPC endpoint — no API key required
    string constant ETH_RPC   = "https://eth.llamarpc.com";
    string constant LLM_MODEL = "zai-org/GLM-4.7-FP8";

    // ── Storage types ─────────────────────────────────────────────────────────
    struct AddressData {
        string  balanceHex;
        string  txCountHex;
        bool    fetched;
    }

    struct CachedResult {
        bytes   rawOutput;  // raw actualOutput from LLM precompile, decoded client-side
        uint256 cachedAt;
        bool    exists;
    }

    // StorageRef tuple for LLM convoHistory field (string,string,string)
    struct StorageRef {
        string platform;
        string path;
        string keyRef;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    address public immutable owner;

    mapping(address => AddressData)  public addressData;
    mapping(address => CachedResult) private _results;

    // ── Events ────────────────────────────────────────────────────────────────
    event DataFetched(address indexed target, string balanceHex, string txCountHex);
    event ReputationAnalyzed(address indexed target, uint256 blockNumber);
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
        bool exists
    ) {
        CachedResult storage r = _results[target];
        return (r.rawOutput, r.cachedAt, r.exists);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function clearCache(address target) external onlyOwner {
        delete _results[target];
        delete addressData[target];
        emit CacheCleared(target);
    }

    // ── TX1: fetch on-chain data via HTTP + JQ ────────────────────────────────
    //
    // Calls the public Ethereum JSON-RPC as a batch request to get balance and
    // transaction count for `target`. JQ (synchronous) parses the response in the
    // same transaction during fulfilled replay.
    //
    // Fee note: the EOA signing this TX must have a RitualWallet deposit.
    //   TTL recommendation: 300 blocks.
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

        // JQ is synchronous — runs in the same fulfilled-replay transaction
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
    // Reads stored AddressData from fetchData and feeds it to the LLM precompile.
    // Raw actualOutput is stored on-chain for caching; decoded client-side.
    //
    // GLM-4.7-FP8 produces <think>...</think> blocks — strip them before JSON.parse.
    // TTL recommendation: 300 blocks. maxCompletionTokens must be >= 4096.
    function analyzeReputation(address target, address executor, uint256 ttl) external {
        require(addressData[target].fetched, "fetchData required first");

        AddressData memory d = addressData[target];

        string memory messages = string.concat(
            '[{"role":"user","content":"Analyze this Ethereum address and score its suspiciousness. '
            'Address: ', _addrToString(target),
            '. ETH balance (hex): ', d.balanceHex,
            '. Transaction count (hex): ', d.txCountHex,
            '. Respond ONLY with valid JSON (no markdown, no explanation): '
            '{\\\"score\\\":42,\\\"reason\\\":\\\"one sentence reason\\\"}. '
            'Score is 0-100 where 0=fully trustworthy 100=extremely high risk."}]'
        );

        (bool ok, bytes memory raw) = address(LLM_PRECOMPILE).call(
            _buildLLMPayload(executor, ttl, messages)
        );
        require(ok, "LLM precompile call failed");

        if (raw.length == 0) return;

        (, bytes memory actual) = abi.decode(raw, (bytes, bytes));

        _results[target] = CachedResult(actual, block.number, true);
        emit ReputationAnalyzed(target, block.number);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    // Builds the 30-field LLM precompile ABI payload.
    // Requires via_ir = true in foundry.toml to avoid stack-too-deep.
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
            true,              // 14 parallelToolCalls (ABI placeholder, always true)
            int256(0),         // 15 presencePenalty (×1000)
            "medium",          // 16 reasoningEffort
            bytes(""),         // 17 responseFormatData
            int256(-1),        // 18 seed
            "",                // 19 serviceTier
            "",                // 20 stopJson
            false,             // 21 stream
            int256(700),       // 22 temperature (0.7 × 1000)
            bytes(""),         // 23 toolChoiceData (ABI placeholder, always 0x)
            bytes(""),         // 24 toolsData (ABI placeholder, always 0x)
            int256(-1),        // 25 topLogprobs
            int256(1000),      // 26 topP (1.0 × 1000)
            "",                // 27 user
            false,             // 28 piiEnabled
            emptyRef           // 29 convoHistory StorageRef("","","")
        );
    }

    // Decodes the JQ string output. JQ type-2 (string) returns abi.encode(bool ok, string result).
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
