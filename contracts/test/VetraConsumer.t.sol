// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VetraConsumer.sol";

contract VetraConsumerTest is Test {
    VetraConsumer consumer;

    address constant TARGET   = address(0xdEaD);
    address constant EXECUTOR = address(0xE1);

    // Mirror events for vm.expectEmit matching
    event DataFetched(address indexed target, string balanceHex, string txCountHex);
    event ReputationAnalyzed(address indexed target, uint256 blockNumber, address indexed requestedBy);

    function setUp() public {
        consumer = new VetraConsumer();
    }

    // ── Access control ────────────────────────────────────────────────────────

    function test_ownerIsDeployer() public view {
        assertEq(consumer.owner(), address(this));
    }

    function test_clearCache_onlyOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert("not owner");
        consumer.clearCache(TARGET);
    }

    // ── Initial state ─────────────────────────────────────────────────────────

    function test_notCachedInitially() public view {
        assertFalse(consumer.isCached(TARGET));
        (, , , , bool exists) = consumer.getResult(TARGET);
        assertFalse(exists);
    }

    function test_analyzeReputation_requiresFetchFirst() public {
        vm.mockCall(address(0x0802), new bytes(0), abi.encode(bytes("")));
        vm.expectRevert("fetchData required first");
        consumer.analyzeReputation(TARGET, EXECUTOR, 300);
    }

    // ── Mock HTTP precompile: simulation path (empty raw output) ──────────────

    function test_fetchData_simulationNoOp() public {
        // During builder simulation the HTTP precompile returns empty bytes
        vm.mockCall(address(0x0801), new bytes(0), new bytes(0));

        consumer.fetchData(TARGET, EXECUTOR, 300);

        // No state written during simulation
        (, , bool fetched) = consumer.addressData(TARGET);
        assertFalse(fetched);
    }

    // ── Mock HTTP + JQ: fulfilled-replay path ────────────────────────────────

    function test_fetchData_storesData() public {
        _mockFetchData(TARGET, "0xde0b6b3a7640000", "0x2a");

        (, , bool fetched) = consumer.addressData(TARGET);
        assertTrue(fetched);
        (string memory bal, string memory txc, ) = consumer.addressData(TARGET);
        assertEq(bal, "0xde0b6b3a7640000");
        assertEq(txc, "0x2a");
    }

    function test_fetchData_emitsEvent() public {
        string memory mockJson = '[{"id":1,"result":"0x100"},{"id":2,"result":"0x3"}]';
        bytes memory httpActual = abi.encode(uint16(200), new string[](0), new string[](0), bytes(mockJson), "");
        bytes memory httpRaw    = abi.encode(bytes(""), httpActual);
        bytes memory jqBal      = _buildJQStringOutput("0x100");
        bytes memory jqTx       = _buildJQStringOutput("0x3");

        vm.mockCall(address(0x0801), new bytes(0), httpRaw);
        vm.mockCall(address(0x0803), abi.encode(".[0].result", mockJson, uint8(2)), jqBal);
        vm.mockCall(address(0x0803), abi.encode(".[1].result", mockJson, uint8(2)), jqTx);

        vm.expectEmit(true, false, false, true);
        emit DataFetched(TARGET, "0x100", "0x3");

        consumer.fetchData(TARGET, EXECUTOR, 300);
    }

    // ── Mock LLM precompile: simulation path ──────────────────────────────────

    function test_analyzeReputation_simulationNoOp() public {
        _mockFetchData(TARGET, "0x1000", "0x5");

        // empty raw = simulation — no state written
        vm.mockCall(address(0x0802), new bytes(0), new bytes(0));

        consumer.analyzeReputation(TARGET, EXECUTOR, 300);

        assertFalse(consumer.isCached(TARGET));
    }

    // ── Mock LLM precompile: fulfilled-replay path ────────────────────────────

    function test_analyzeReputation_storesResult() public {
        _mockFetchData(TARGET, "0x1000", "0x5");

        // The contract stores rawOutput = actualOutput from the SPC envelope.
        // We mock the precompile to return abi.encode(simmedInput, actualOutput).
        bytes memory llmActual = bytes('{"score":25,"reason":"Low activity."}');
        bytes memory llmRaw    = abi.encode(bytes(""), llmActual);
        vm.mockCall(address(0x0802), new bytes(0), llmRaw);

        vm.expectEmit(true, false, true, true);
        emit ReputationAnalyzed(TARGET, block.number, address(this));

        consumer.analyzeReputation(TARGET, EXECUTOR, 300);

        assertTrue(consumer.isCached(TARGET));
        (bytes memory stored, , , , bool exists) = consumer.getResult(TARGET);
        assertEq(stored, llmActual);
        assertTrue(exists);
    }

    // ── Second analyze overwrites cache ───────────────────────────────────────

    function test_analyzeReputation_overwritesCache() public {
        _mockFetchData(TARGET, "0x1000", "0x5");

        bytes memory first  = bytes("first_result");
        bytes memory second = bytes("second_result");

        vm.mockCall(address(0x0802), new bytes(0), abi.encode(bytes(""), first));
        consumer.analyzeReputation(TARGET, EXECUTOR, 300);

        vm.mockCall(address(0x0802), new bytes(0), abi.encode(bytes(""), second));
        consumer.analyzeReputation(TARGET, EXECUTOR, 300);

        (bytes memory stored, , , , ) = consumer.getResult(TARGET);
        assertEq(stored, second);
    }

    // ── Cache clear ───────────────────────────────────────────────────────────

    function test_clearCache_removesData() public {
        _mockFetchData(TARGET, "0x100", "0x1");

        vm.mockCall(address(0x0802), new bytes(0), abi.encode(bytes(""), bytes("mock_actual")));
        consumer.analyzeReputation(TARGET, EXECUTOR, 300);

        assertTrue(consumer.isCached(TARGET));

        consumer.clearCache(TARGET);

        assertFalse(consumer.isCached(TARGET));
        (, , bool fetched) = consumer.addressData(TARGET);
        assertFalse(fetched);
    }

    // ── addrToString smoke test ───────────────────────────────────────────────

    function test_fetchData_zeroAddress() public {
        // Should not revert building the payload for zero address
        string memory mockJson = '[{"id":1,"result":"0x0"},{"id":2,"result":"0x0"}]';
        bytes memory httpActual = abi.encode(uint16(200), new string[](0), new string[](0), bytes(mockJson), "");
        bytes memory httpRaw    = abi.encode(bytes(""), httpActual);
        bytes memory jqBal      = _buildJQStringOutput("0x0");
        bytes memory jqTx       = _buildJQStringOutput("0x0");

        vm.mockCall(address(0x0801), new bytes(0), httpRaw);
        vm.mockCall(address(0x0803), abi.encode(".[0].result", mockJson, uint8(2)), jqBal);
        vm.mockCall(address(0x0803), abi.encode(".[1].result", mockJson, uint8(2)), jqTx);

        consumer.fetchData(address(0), EXECUTOR, 300);

        (, , bool fetched) = consumer.addressData(address(0));
        assertTrue(fetched);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _mockFetchData(address target, string memory bal, string memory txc) internal {
        string memory mockJson = string.concat(
            '[{"id":1,"result":"', bal, '"},{"id":2,"result":"', txc, '"}]'
        );
        bytes memory httpActual = abi.encode(uint16(200), new string[](0), new string[](0), bytes(mockJson), "");
        bytes memory httpRaw    = abi.encode(bytes(""), httpActual);
        bytes memory jqBal      = _buildJQStringOutput(bal);
        bytes memory jqTx       = _buildJQStringOutput(txc);

        vm.mockCall(address(0x0801), new bytes(0), httpRaw);
        vm.mockCall(address(0x0803), abi.encode(".[0].result", mockJson, uint8(2)), jqBal);
        vm.mockCall(address(0x0803), abi.encode(".[1].result", mockJson, uint8(2)), jqTx);

        consumer.fetchData(target, EXECUTOR, 300);
        vm.clearMockedCalls();
    }

    // Builds bytes matching the JQ type-2 string output ABI layout:
    //   abi.encode(bool ok, string result) → data[64-95] = strLen, data[96+] = string bytes
    function _buildJQStringOutput(string memory s) internal pure returns (bytes memory) {
        bytes memory strBytes = bytes(s);
        uint256 strLen = strBytes.length;
        uint256 padded = ((strLen + 31) / 32) * 32;
        bytes memory out = new bytes(96 + padded);

        // byte 31: bool true = 1
        out[31] = 0x01;
        // bytes 32-63: string offset = 0x40 = 64
        out[63] = 0x40;
        // bytes 64-95: strLen
        assembly { mstore(add(add(out, 32), 64), strLen) }
        // bytes 96+: string content
        for (uint256 i = 0; i < strLen; i++) {
            out[96 + i] = strBytes[i];
        }
        return out;
    }
}
