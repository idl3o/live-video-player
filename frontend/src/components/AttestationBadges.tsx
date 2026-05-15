import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import {
  CLIP_PRAISE_SCHEMA,
  STREAMER_ENDORSEMENT_SCHEMA,
  fetchAttestationsForAddress,
  isEasConfigured,
  type EasAttestation,
} from '../lib/eas';

interface Props {
  address: Address;
}

interface Counts {
  praise: EasAttestation[];
  endorsement: EasAttestation[];
}

export function AttestationBadges({ address }: Props) {
  const [counts, setCounts] = useState<Counts>({ praise: [], endorsement: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isEasConfigured()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [praise, endorsement] = await Promise.all([
          fetchAttestationsForAddress(address, CLIP_PRAISE_SCHEMA),
          fetchAttestationsForAddress(address, STREAMER_ENDORSEMENT_SCHEMA),
        ]);
        if (!cancelled) setCounts({ praise, endorsement });
      } catch {
        // EASScan transient errors — surface as zero counts
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!isEasConfigured()) return null;
  if (loading) return null;

  const total = counts.praise.length + counts.endorsement.length;
  if (total === 0) return null;

  return (
    <div className="attestation-badges">
      {counts.praise.length > 0 && (
        <span className="badge praise" title="Clip praises received">
          ★ {counts.praise.length}
        </span>
      )}
      {counts.endorsement.length > 0 && (
        <span className="badge endorse" title="Endorsements received">
          ✦ {counts.endorsement.length}
        </span>
      )}
    </div>
  );
}
