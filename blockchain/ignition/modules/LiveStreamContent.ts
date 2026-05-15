import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('LiveStreamContent', (m) => {
  const registry = m.contract('LiveStreamContent', []);
  return { registry };
});
