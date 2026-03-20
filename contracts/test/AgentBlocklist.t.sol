// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentBlocklist.sol";

contract AgentBlocklistTest is Test {
    AgentBlocklist blocklist;
    address owner = address(this);
    address agent1 = address(0xA1);
    address agent2 = address(0xA2);
    address nonOwner = address(0xBEEF);

    function setUp() public {
        blocklist = new AgentBlocklist();
    }

    function test_blockAgent() public {
        blocklist.blockAgent(agent1, "Trust score < 40");
        assertTrue(blocklist.isBlocked(agent1));
    }

    function test_unblockAgent() public {
        blocklist.blockAgent(agent1, "Suspicious");
        blocklist.unblockAgent(agent1);
        assertFalse(blocklist.isBlocked(agent1));
    }

    function test_isBlocked_defaultFalse() public view {
        assertFalse(blocklist.isBlocked(agent1));
    }

    function test_blockAgent_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit AgentBlocklist.AgentBlocked(agent1, "Drain pattern");
        blocklist.blockAgent(agent1, "Drain pattern");
    }

    function test_unblockAgent_emitsEvent() public {
        blocklist.blockAgent(agent1, "Test");
        vm.expectEmit(true, false, false, false);
        emit AgentBlocklist.AgentUnblocked(agent1);
        blocklist.unblockAgent(agent1);
    }

    function test_revert_blockZeroAddress() public {
        vm.expectRevert("Zero address");
        blocklist.blockAgent(address(0), "Invalid");
    }

    function test_revert_blockAlreadyBlocked() public {
        blocklist.blockAgent(agent1, "First");
        vm.expectRevert("Already blocked");
        blocklist.blockAgent(agent1, "Second");
    }

    function test_revert_unblockNotBlocked() public {
        vm.expectRevert("Not blocked");
        blocklist.unblockAgent(agent1);
    }

    function test_revert_nonOwnerBlock() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        blocklist.blockAgent(agent1, "Unauthorized");
    }

    function test_revert_nonOwnerUnblock() public {
        blocklist.blockAgent(agent1, "Test");
        vm.prank(nonOwner);
        vm.expectRevert();
        blocklist.unblockAgent(agent1);
    }

    function test_blockBatch() public {
        address[] memory agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;
        blocklist.blockAgentsBatch(agents, "Batch block");
        assertTrue(blocklist.isBlocked(agent1));
        assertTrue(blocklist.isBlocked(agent2));
    }

    function test_blockBatch_skipsZeroAndDuplicates() public {
        blocklist.blockAgent(agent1, "Already");
        address[] memory agents = new address[](3);
        agents[0] = address(0);
        agents[1] = agent1;
        agents[2] = agent2;
        blocklist.blockAgentsBatch(agents, "Batch");
        assertFalse(blocklist.isBlocked(address(0)));
        assertTrue(blocklist.isBlocked(agent2));
    }
}
