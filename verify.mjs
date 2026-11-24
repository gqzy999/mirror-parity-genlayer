import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createAccount, createClient, abi } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

const cfg = JSON.parse(await readFile(new URL('./scenario.json', import.meta.url)));
const source = await readFile(new URL('./contracts/contract.py', import.meta.url), 'utf8');
const chain = studionet;
assert.equal(chain.id, 61999);
assert.equal(chain.rpcUrls.default.http[0], 'https://studio.genlayer.com/api');
const evidenceUrl = new URL('./evidence/studionet.json', import.meta.url);
const write = process.argv.includes('--execute');
const account = write ? createAccount(process.env.STUDIONET_PRIVATE_KEY) : undefined;
const client = createClient({ chain, account });
const events = [];
const proof = write ? { chainId: chain.id, sourceSha256: createHash('sha256').update(source).digest('hex'), events }
  : JSON.parse(await readFile(evidenceUrl));
const save = async () => {
  if (write) await writeFile(evidenceUrl, JSON.stringify(proof, null, 2) + '\n');
};
assert.equal(BigInt(await client.request({method: 'eth_chainId'})), 61999n);
async function confirm(hash, expected, call) {
  await client.waitForTransactionReceipt({ hash, waitUntil: 'finalized', retries: 100, interval: 4000 });
  const tx = await client.getTransaction({hash});
  const leaders = tx.consensus_data.leader_receipt;
  const leader = Array.isArray(leaders) ? leaders.find(r => r.mode === 'leader') ?? leaders[0] : leaders;
  if (call) {
    const calldata = abi.calldata.decode(Buffer.from(tx.data.calldata.base64, 'base64'));
    assert.equal(calldata.get(''), call.method);
    const normalize = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? Number(item) : item);
    assert.equal(normalize(calldata.get('args') ?? []), normalize(call.args));
    assert.equal((tx.to_address ?? tx.recipient).toLowerCase(), address.toLowerCase());
  }
  const status = tx.statusName ?? tx.status_name;
  assert.equal(status, 'FINALIZED');
  const raw = Buffer.from(typeof leader.result === 'string' ? leader.result : leader.result.raw, 'base64');
  const execution = leader.execution_result;
  if (expected) {
    assert.notEqual(execution, 'SUCCESS');
    assert.equal(raw[0], 1);
    assert.equal(raw.subarray(1).toString('utf8'), expected);
  } else {
    assert.equal(execution, 'SUCCESS');
    assert.equal(raw[0], 0);
  }
  return { status, execution, result: expected ?? abi.calldata.decode(raw.subarray(1)),
    destination: tx.data?.contract_address ?? tx.to_address ?? tx.recipient };
}
const isAddress = /^0x[0-9a-fA-F]{40}$/;
let fees;
if (write) {
  if (!process.env.STUDIONET_PRIVATE_KEY) {
    assert.equal(process.env.STUDIONET_FAUCET, '1', 'Provide a funded account or opt into the test faucet');
    await client.request({method:'sim_fundAccount',params:[account.address, 10 ** 18]});
  }
  fees = await client.estimateTransactionFees({leaderTimeunitsAllocation:100n,validatorTimeunitsAllocation:200n,rotations:[0n]});
  proof.deployment = {hash:await client.deployContract({code:source,args:cfg.constructorArgs,leaderOnly:false,fees})};
  console.error('deploy',proof.deployment.hash);
  await save();
}
const deploy = await confirm(proof.deployment.hash);
const address = deploy.destination;
assert.match(address,isAddress);
assert.equal(await client.getContractCode(address),source);
assert.equal(proof.sourceSha256,createHash('sha256').update(source).digest('hex'));
if (write) {
  proof.deployment = {...proof.deployment,...deploy};
  proof.address = address;
  await save();
} else {
  assert.equal(proof.address,address);
  assert.equal(proof.events.length,cfg.calls.length);
}
for (const [index, call] of cfg.calls.entries()) {
  if (!write) {
    const record = proof.events[index];
    assert.equal(record.method,call.method);
    await confirm(record.hash,call.error,call);
    continue;
  }
  const hash = await client.writeContract({address,functionName:call.method,args:call.args,value:0n,leaderOnly:false,fees});
  console.error(call.method,hash);
  const record = {method:call.method,args:call.args,hash};
  proof.events.push(record);
  await save();
  Object.assign(record,await confirm(hash,call.error,call));
  if (typeof record.result === 'bigint') record.result = Number(record.result);
  await save();
}
for (const check of cfg.views) {
  const raw = await client.readContract({address,functionName:check.method,args:check.args,
    transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  const state = raw ? JSON.parse(raw) : null;
  if (check.expected === null) assert.equal(state,null);
  else for (const [field,value] of Object.entries(check.expected)) assert.deepEqual(state[field],value);
  if (write) (proof.readbacks ??= []).push({method:check.method,args:check.args,state});
}
await save();
console.log(address, 'source parity, finalized receipts, and state verified');
