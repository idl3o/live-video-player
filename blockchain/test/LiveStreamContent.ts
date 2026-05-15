import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LiveStreamContent', () => {
  async function deploy() {
    const [creator, viewer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('LiveStreamContent');
    const registry = await Factory.deploy();
    return { registry, creator, viewer };
  }

  it('registers a fresh CID and stores creator + timestamp + title', async () => {
    const { registry, creator } = await deploy();
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

    const tx = await registry.registerContent(cid, 'first live');
    await tx.wait();

    const [storedCreator, registeredAt, title] = await registry.getContent(cid);
    expect(storedCreator).to.equal(await creator.getAddress());
    expect(registeredAt).to.be.gt(0n);
    expect(title).to.equal('first live');
    expect(await registry.isRegistered(cid)).to.equal(true);
  });

  it('emits ContentRegistered with creator + CID + title', async () => {
    const { registry, creator } = await deploy();
    const cid = 'bafytestemit';
    await expect(registry.registerContent(cid, 'hello'))
      .to.emit(registry, 'ContentRegistered');
    // Verify the event payload via the log query API for robustness across
    // hardhat-chai-matchers versions.
    const filter = registry.filters.ContentRegistered();
    const events = await registry.queryFilter(filter);
    expect(events).to.have.length(1);
    const args = events[0].args as unknown as {
      contentCid: string;
      creator: string;
      title: string;
    };
    expect(args.contentCid).to.equal(cid);
    expect(args.creator).to.equal(await creator.getAddress());
    expect(args.title).to.equal('hello');
  });

  it('rejects empty CID', async () => {
    const { registry } = await deploy();
    await expect(registry.registerContent('', 'nope')).to.be.revertedWithCustomError(
      registry,
      'EmptyContentCid'
    );
  });

  it('rejects double-registration; first writer wins', async () => {
    const { registry, creator, viewer } = await deploy();
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    await registry.connect(creator).registerContent(cid, 'first');
    await expect(registry.connect(viewer).registerContent(cid, 'second'))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered')
      .withArgs(cid, await creator.getAddress());
  });

  it('returns zero address for unknown CID', async () => {
    const { registry } = await deploy();
    const [c, t, title] = await registry.getContent('bafyunknown');
    expect(c).to.equal(ethers.ZeroAddress);
    expect(t).to.equal(0n);
    expect(title).to.equal('');
  });
});
