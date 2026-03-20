// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentBlocklist.sol";

contract DeployBlocklist is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        AgentBlocklist blocklist = new AgentBlocklist();
        console.log("AgentBlocklist deployed:", address(blocklist));

        vm.stopBroadcast();
    }
}
