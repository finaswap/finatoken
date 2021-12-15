import { ethers } from "hardhat";
import { expect } from "chai";

import { sign as EIP712Sign } from "./utilities/EIP712"


describe("FinaToken", function () {
    before(async function() {
        this.FinaToken = await ethers.getContractFactory("FinaToken");
        this.signers = await ethers.getSigners();
        this.alice = this.signers[0];
        this.bob = this.signers[1];
        this.carol = this.signers[2];
        this.ginger = this.signers[3];

        this.name = "FinaToken";
        this.ticker = "FNA";
        this.chainId = 31337;

        this.EIP712 = {
            types: {
                EIP712Domain: [
                    { name: "name", type: "string" },
                    { name: "version", type: "string" },
                    { name: "chainId", type: "uint256" },
                    { name: "verifyingContract", type: "address" }
                ],
                Delegation: [
                    { name: "delegatee", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiry", type: "uint256" }
                ]
            },
            domain(context) {
                return {
                    name: context.name,
                    version: "1",
                    chainId: context.chainId,
                    verifyingContract: context.fina.address
                }
            },
            primaryType: "Delegation"
        }
    });

    beforeEach(async function() {
        this.blocktime = Date.now();

        this.fina = await this.FinaToken.deploy(this.name, this.ticker);
        await this.fina.deployed();

        const minterRole = await this.fina.MINTER_ROLE();
        await this.fina.grantRole(minterRole, this.fina.signer.address);

        const pauserRole = await this.fina.PAUSER_ROLE();
        await this.fina.grantRole(pauserRole, this.fina.signer.address);
    });


    describe("metadata", () => {
        it("should have correct name and symbol and decimal",
            async function() {
                const name = await this.fina.name();
                const symbol = await this.fina.symbol();
                const decimals = await this.fina.decimals();
                expect(name, "FinaToken");
                expect(symbol, "FNA");
                expect(decimals, "18");
            });
    });

    describe("mint", () => {
        it("should only allow role members to mint token", async function () {
            await this.fina.mint(this.alice.address, "100");
            await this.fina.mint(this.bob.address, "1000");
            await expect(this.fina.connect(this.bob).mint(this.carol.address, "1000", { from: this.bob.address })).to.be.revertedWith(
                    "FinaToken: must have minter role to mint"
                  );
            const totalSupply = await this.fina.totalSupply();
            const aliceBal = await this.fina.balanceOf(this.alice.address);
            const bobBal = await this.fina.balanceOf(this.bob.address);
            const carolBal = await this.fina.balanceOf(this.carol.address);
            expect(totalSupply).to.equal("1100");
            expect(aliceBal).to.equal("100");
            expect(bobBal).to.equal("1000");
            expect(carolBal).to.equal("0");
        });

        it("should mint the proper amount", async function () {
            await this.fina.mint(this.alice.address, "100");
            expect(await this.fina.balanceOf(this.alice.address)).to.be.equal(100);
        });

        it("should add the amount from the total supply", async function () {
            await this.fina.mint(this.alice.address, "90");
            expect(await this.fina.totalSupply()).to.be.equal(90);
        });
    });

    describe("burn", () => {
        it("should burn the proper amount", async function () {
            await this.fina.mint(this.alice.address, "100");
            expect(await this.fina.balanceOf(this.alice.address)).to.be.equal(100);

            await this.fina.connect(this.alice).burn("90");

            expect(await this.fina.balanceOf(this.alice.address)).to.be.equal(10);
        });

        it("should subtract the amount from the total supply", async function () {
            await this.fina.mint(this.alice.address, "100");
            expect(await this.fina.totalSupply()).to.be.equal(100);

            await this.fina.connect(this.alice).burn("90");

            expect(await this.fina.totalSupply()).to.be.equal(10);
        });
    });

    describe("pause", () => {
        it("should only allow role members to pause", async function () {
            await expect(this.fina.connect(this.bob).pause()).to.be.revertedWith(
                "FinaToken: must have pauser role to pause"
            );
        });
        it("should not allow transfers when paused", async function () {
            await this.fina.pause();
            await expect(this.fina.connect(this.bob).transfer(this.alice.address, 10)).to.be.revertedWith(
                "ERC20Pausable: token transfer while paused"
            );
        });
        it("should not allow mint when paused", async function () {
            await this.fina.pause();
            await expect(this.fina.mint(this.alice.address, 10)).to.be.revertedWith(
                "ERC20Pausable: token transfer while paused"
            );
        });
        it("should not allow burn when paused", async function () {
            await this.fina.pause();
            await expect(this.fina.connect(this.alice).burn(10)).to.be.revertedWith(
                "ERC20Pausable: token transfer while paused"
            );
        });
    });

    describe("unpause", () => {
        it("should only allow role members to pause", async function () {
            await expect(this.fina.connect(this.bob).unpause()).to.be.revertedWith(
                "FinaToken: must have pauser role to unpause"
            );
        });
        it("should allow transfers when unpaused", async function () {
            await this.fina.mint(this.bob.address, "10");

            await this.fina.pause();
            await expect(this.fina.connect(this.bob).transfer(this.alice.address, 10)).to.be.revertedWith(
                "ERC20Pausable: token transfer while paused"
            );
            await this.fina.unpause();

            await this.fina.connect(this.bob).transfer(this.alice.address, 10);

            expect(await this.fina.balanceOf(this.alice.address)).to.be.equal(10);
            expect(await this.fina.balanceOf(this.bob.address)).to.be.equal(0);
        });
    });

    describe("transfer", () => {
        it("should supply token transfers properly",
            async function() {
                await this.fina.mint(this.alice.address, "100");
                await this.fina.mint(this.bob.address, "1000");
                await this.fina.transfer(this.carol.address, "10");
                await this.fina.connect(this.bob).transfer(this.carol.address, "100", {
                        from: this.bob.address,
                       });
                const totalSupply = await this.fina.totalSupply();
                const aliceBal = await this.fina.balanceOf(this.alice.address);
                const bobBal = await this.fina.balanceOf(this.bob.address);
                const carolBal = await this.fina.balanceOf(this.carol.address);
                expect(totalSupply, "1100");
                expect(aliceBal, "90");
                expect(bobBal, "900");
                expect(carolBal, "110");
            });

        it("should fail if you try to do bad transfers", async function () {
            await this.fina.mint(this.alice.address, "100");
            await expect(this.fina.transfer(this.carol.address, "110")).to.be.revertedWith("ERC20: transfer amount exceeds balance");
            await expect(this.fina.connect(this.bob).transfer(this.carol.address, "1", { from: this.bob.address })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });
    });

    describe("delegateBySig", () => {
        it("reverts if the signatory is invalid", async function () {
            const delegatee = this.alice.address, nonce = 0, expiry = this.blocktime + 1000;

            const r = `0x0000000000000000000000000000000000000000000000000000000000000000`;
            const s = `0x0000000000000000000000000000000000000000000000000000000000000000`;
            const v = parseInt("1c", 16);

            await expect(this.fina.delegateBySig(delegatee, nonce, expiry, v, r, s)).to.be.revertedWith(
                "ECDSA: invalid signature"
            );
        });

        it("reverts if the nonce is bad", async function () {
            const delegatee = this.alice.address, nonce = 1, expiry = this.blocktime + 1000;

            const message = { delegatee, nonce, expiry };
            const domain = this.EIP712.domain(this);
            const primaryType = this.EIP712.primaryType;
            const types = this.EIP712.types;
            const signer = this.bob;

            const { v, r, s } = await EIP712Sign(domain, primaryType, message, types, signer);

            await expect(this.fina.connect(signer).delegateBySig(delegatee, nonce, expiry, v, r, s)).to.be.revertedWith(
                "ERC20Votes: invalid nonce"
            );
        });

        it("reverts if the signature has expired", async function () {
            const delegatee = this.alice.address, nonce = 0, expiry = 0;

            const message = { delegatee, nonce, expiry };
            const domain = this.EIP712.domain(this);
            const primaryType = this.EIP712.primaryType;
            const types = this.EIP712.types;
            const signer = this.bob;

            const { v, r, s } = await EIP712Sign(domain, primaryType, message, types, signer);

            await expect(this.fina.delegateBySig(delegatee, nonce, expiry, v, r, s)).to.be.revertedWith(
                "ERC20Votes: signature expired"
            );
        });

        it("delegates on behalf of the signatory", async function () {
            const delegatee = this.alice.address, nonce = 0, expiry = 9999999999;

            const message = { delegatee, nonce, expiry };
            const domain = this.EIP712.domain(this);
            const primaryType = this.EIP712.primaryType;
            const types = this.EIP712.types;
            const signer = this.bob;

            const { v, r, s } = await EIP712Sign(domain, primaryType, message, types, signer);

            const tx = await this.fina.connect(this.bob).delegateBySig(delegatee, nonce, expiry, v, r, s);

            expect(tx.gasUsed < 80000);

            expect(await this.fina.delegates(signer.address)).to.be.equal(this.alice.address);
        });
    });

    describe("numCheckpoints", () => {
        it("returns the number of checkpoints for a delegate", async function () {
            await this.fina.mint(this.alice.address, "100");
            await this.fina.mint(this.ginger.address, "100");

            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(0);

            const t1 = await this.fina.connect(this.alice).delegate(this.bob.address);
            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(1);

            const t2 = await this.fina.connect(this.alice).transfer(this.carol.address, 10);
            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(2);

            const t3 = await this.fina.connect(this.alice).transfer(this.carol.address, 10);
            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(3);

            const t4 = await this.fina.connect(this.ginger).transfer(this.alice.address, 20);
            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(4);

            const t5 = await this.fina.checkpoints(this.bob.address, 0);
            expect(t5).to.have.property("fromBlock", t1.blockNumber);
            expect(t5.votes).to.be.equal(100);

            const t6 = await this.fina.checkpoints(this.bob.address, 1);
            expect(t6).to.have.property("fromBlock", t2.blockNumber);
            expect(t6.votes).to.be.equal(90);

            const t7 = await this.fina.checkpoints(this.bob.address, 2);
            expect(t7).to.have.property("fromBlock", t3.blockNumber);
            expect(t7.votes).to.be.equal(80);

            const t8 = await this.fina.checkpoints(this.bob.address, 3);
            expect(t8).to.have.property("fromBlock", t4.blockNumber);
            expect(t8.votes).to.be.equal(100);
        });

        it("does not add more than one checkpoint in a block", async function () {
            await this.fina.mint(this.alice.address, "100");

            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(0);
            await ethers.provider.send("evm_setAutomine", [false]);

            const t1 = await this.fina.connect(this.alice).delegate(this.bob.address);
            const t2 = await this.fina.connect(this.alice).transfer(this.carol.address, 10);
            const t3 = await this.fina.connect(this.alice).transfer(this.carol.address, 10);

            await ethers.provider.send("evm_setAutomine", [true]);
            await ethers.provider.send("evm_mine", [0]);

            const blockNumber = await ethers.provider.getBlockNumber();

            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(1);

            const t5 = await this.fina.checkpoints(this.bob.address, 0);
            expect(t5).to.have.property("fromBlock", blockNumber);
            expect(t5.votes).to.be.equal(80);;

            const t6 = await this.fina.mint(this.alice.address, "20");
            await expect(await this.fina.numCheckpoints(this.bob.address)).to.be.equal(2);

            const t7 = await this.fina.checkpoints(this.bob.address, 1);
            expect(t7).to.have.property("fromBlock", t6.blockNumber);
            expect(t7.votes).to.be.equal(100);
        });
    });

    describe("getPastVotes", () => {
        it('reverts if block number >= current block', async function () {
            await expect(this.fina.getPastVotes(this.alice.address, 5e10)).to.be.revertedWith("ERC20Votes: block not yet mined");
        });

        it("returns 0 if there are no checkpoints", async function () {
            expect(await this.fina.getPastVotes(this.alice.address, 0)).to.be.equal(0);
        });

        it("returns the latest block if >= last checkpoint block", async function () {
            await this.fina.mint(this.bob.address, "100");

            const t1 = await this.fina.connect(this.bob).delegate(this.alice.address);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);


            expect(await this.fina.getPastVotes(this.alice.address, t1.blockNumber)).to.be.equal(100);
            expect(await this.fina.getPastVotes(this.alice.address, t1.blockNumber + 1)).to.be.equal(100);
        });

        it("returns zero if < first checkpoint block", async function () {
            await this.fina.mint(this.bob.address, "100");

            const t1 = await this.fina.connect(this.bob).delegate(this.alice.address);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);

            expect(await this.fina.getPastVotes(this.alice.address, t1.blockNumber - 1)).to.be.equal(0);
            expect(await this.fina.getPastVotes(this.alice.address, t1.blockNumber + 1)).to.be.equal(100);
        });

        it("generally returns the voting balance at the appropriate checkpoint", async function () {
            await this.fina.mint(this.alice.address, "100");

            const t1 = await this.fina.delegate(this.bob.address);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);
            const t2 = await this.fina.transfer(this.carol.address, 10);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);
            const t3 = await this.fina.transfer(this.carol.address, 10);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);
            const t4 = await this.fina.connect(this.carol).transfer(this.alice.address, 20);
            await ethers.provider.send("evm_mine", [0]);
            await ethers.provider.send("evm_mine", [0]);

            expect(await this.fina.getPastVotes(this.bob.address, t1.blockNumber - 1)).to.be.equal(0);
            expect(await this.fina.getPastVotes(this.bob.address, t1.blockNumber)).to.be.equal(100);
            expect(await this.fina.getPastVotes(this.bob.address, t1.blockNumber + 1)).to.be.equal(100);
            expect(await this.fina.getPastVotes(this.bob.address, t2.blockNumber)).to.be.equal(90);
            expect(await this.fina.getPastVotes(this.bob.address, t2.blockNumber + 1)).to.be.equal(90);
            expect(await this.fina.getPastVotes(this.bob.address, t3.blockNumber)).to.be.equal(80);
            expect(await this.fina.getPastVotes(this.bob.address, t3.blockNumber + 1)).to.be.equal(80);
            expect(await this.fina.getPastVotes(this.bob.address, t4.blockNumber)).to.be.equal(100);
            expect(await this.fina.getPastVotes(this.bob.address, t4.blockNumber + 1)).to.be.equal(100);
        });
    });
});
