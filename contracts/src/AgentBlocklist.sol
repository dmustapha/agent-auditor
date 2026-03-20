// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentBlocklist
/// @notice Maintains a blocklist of agent addresses flagged by AgentAuditor
/// @dev Owner-only writes, public reads. Emits events for indexing.
contract AgentBlocklist is Ownable {
    mapping(address => bool) private _blocked;

    event AgentBlocked(address indexed agent, string reason);
    event AgentUnblocked(address indexed agent);

    constructor() Ownable(msg.sender) {}

    function blockAgent(address agent, string calldata reason) external onlyOwner {
        require(agent != address(0), "Zero address");
        require(!_blocked[agent], "Already blocked");
        _blocked[agent] = true;
        emit AgentBlocked(agent, reason);
    }

    function unblockAgent(address agent) external onlyOwner {
        require(_blocked[agent], "Not blocked");
        _blocked[agent] = false;
        emit AgentUnblocked(agent);
    }

    function isBlocked(address agent) external view returns (bool) {
        return _blocked[agent];
    }

    function blockAgentsBatch(
        address[] calldata agents,
        string calldata reason
    ) external onlyOwner {
        for (uint256 i; i < agents.length; ++i) {
            if (agents[i] != address(0) && !_blocked[agents[i]]) {
                _blocked[agents[i]] = true;
                emit AgentBlocked(agents[i], reason);
            }
        }
    }
}
