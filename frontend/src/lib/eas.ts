import { encodeAbiParameters, type Address, type Hex } from 'viem';

// EAS protocol on Base Sepolia — same address as Base mainnet under the
// Optimism predeploys convention.
export const EAS_CONTRACT: Address = '0x4200000000000000000000000000000000000021';

// EASScan GraphQL endpoint for Base Sepolia. Used for read queries.
export const EASSCAN_GRAPHQL = 'https://base-sepolia.easscan.org/graphql';

// Schema UIDs. Register these on https://base-sepolia.easscan.org/schema/create
// and put the resulting UIDs into env.
//
// Suggested schema strings:
//   StreamerEndorsement: "string role, string note"
//     (recipient = the streamer/mod being endorsed)
//   ClipPraise:          "string contentCid, uint8 score, string note"
//     (recipient = the streamer who created the clip)
const ZERO_BYTES32: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const STREAMER_ENDORSEMENT_SCHEMA: Hex =
  (import.meta.env.VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA as Hex | undefined) || ZERO_BYTES32;
export const CLIP_PRAISE_SCHEMA: Hex =
  (import.meta.env.VITE_EAS_CLIP_PRAISE_SCHEMA as Hex | undefined) || ZERO_BYTES32;

export const isEasConfigured = (): boolean =>
  STREAMER_ENDORSEMENT_SCHEMA !== ZERO_BYTES32 && CLIP_PRAISE_SCHEMA !== ZERO_BYTES32;

// EAS attest() ABI (just the bits we need).
export const EAS_ABI = [
  {
    type: 'function',
    name: 'attest',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

// Encode ClipPraise schema: (string contentCid, uint8 score, string note)
export function encodeClipPraise(contentCid: string, score: number, note: string): Hex {
  return encodeAbiParameters(
    [
      { name: 'contentCid', type: 'string' },
      { name: 'score', type: 'uint8' },
      { name: 'note', type: 'string' },
    ],
    [contentCid, Math.min(255, Math.max(0, Math.floor(score))), note]
  );
}

// Encode StreamerEndorsement schema: (string role, string note)
export function encodeStreamerEndorsement(role: string, note: string): Hex {
  return encodeAbiParameters(
    [
      { name: 'role', type: 'string' },
      { name: 'note', type: 'string' },
    ],
    [role, note]
  );
}

export interface EasAttestation {
  id: string;
  attester: Address;
  recipient: Address;
  timeCreated: number;
  decodedDataJson: string;
}

export async function fetchAttestationsForAddress(
  address: Address,
  schemaId: Hex
): Promise<EasAttestation[]> {
  if (!schemaId) return [];
  const query = `
    query AttestationsFor($recipient: String!, $schemaId: String!) {
      attestations(
        where: { recipient: { equals: $recipient }, schemaId: { equals: $schemaId } }
        orderBy: { timeCreated: desc }
        take: 25
      ) {
        id
        attester
        recipient
        timeCreated
        decodedDataJson
      }
    }
  `;
  const res = await fetch(EASSCAN_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { recipient: address, schemaId },
    }),
  });
  if (!res.ok) throw new Error(`EASScan: ${res.status}`);
  const body = await res.json();
  return body.data?.attestations || [];
}
