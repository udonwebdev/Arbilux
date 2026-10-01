// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {VerifyDeployment} from "../script/VerifyDeployment.s.sol";

contract VerifyDeploymentTest is Test {
    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    ArbiluxExecutor public executor;
    VerifyDeployment public verifier;

    function setUp() public {
        executor = new ArbiluxExecutor(AAVE_PROVIDER, payable(address(this)), payable(address(0xbeef)));
        verifier = new VerifyDeployment();
    }

    function test_VerifyDeploymentPassesWithZeroLeakage() public {
        vm.setEnv("ARBILUX_EXECUTOR_ADDRESS", vm.toString(address(executor)));
        verifier.run();
        console2.log("Deployment verification passed with zero leakage verified.");
    }
}
