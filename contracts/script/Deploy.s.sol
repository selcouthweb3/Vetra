// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/VetraConsumer.sol";

contract Deploy is Script {
    function run() external returns (VetraConsumer consumer) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        consumer = new VetraConsumer();
        vm.stopBroadcast();
        console.log("VetraConsumer deployed at:", address(consumer));
    }
}
