import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { activePendingContracts, isOfferPending } from '../core/contracts';
import { CONTRACT_TIERS, TIER0_PAYLOAD_EXTRA_HARDWARE, TIER0_PAYLOAD_EXTRA_PROPELLANT } from '../data/contracts';
import { SOUNDING_ROCKETS } from '../data/soundingRockets';
import { formatDuration } from '../core/format';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
import type { ContractOffer } from '../core/types';

const TIER0_COST = {
  hardware: SOUNDING_ROCKETS.s1.assemblyHardware + TIER0_PAYLOAD_EXTRA_HARDWARE,
  propellant: SOUNDING_ROCKETS.s1.launchPropellant + TIER0_PAYLOAD_EXTRA_PROPELLANT,
};

function OfferCard({ offer, now }: { offer: ContractOffer; now: number }) {
  const acceptContractOffer = useGameStore((s) => s.acceptContractOffer);
  const remaining = offer.offeredAt + offer.deadlineMs - now;

  return (
    <div className="research-node">
      <div className="research-node__name">{offer.client}</div>
      <div className="research-node__description">
        Fly their instrument package on an S-1. All-inclusive: <CostLabel cost={TIER0_COST} />. Pays{' '}
        <CostLabel cost={{ funding: CONTRACT_TIERS[0].reward.funding }} /> + {CONTRACT_TIERS[0].reward.reputation} Reputation.
      </div>
      <div className="research-node__cost">Offer expires in {formatDuration(Math.max(0, remaining))}</div>
      <button type="button" className="upgrade-button" onClick={() => acceptContractOffer(offer.id)}>
        Accept
      </button>
    </div>
  );
}

function ActiveContractRow({ client, deadlineRemaining }: { client: string; deadlineRemaining: number }) {
  return (
    <div className="research-node research-node--done">
      <div className="research-node__name">{client}</div>
      <div className="research-node__description">
        Accepted — deliver via a linked S-1 flight in Testing before the deadline.
      </div>
      <div className="research-node__cost">Deadline: {formatDuration(Math.max(0, deadlineRemaining))}</div>
    </div>
  );
}

/** ECONOMY §10 / UI_SPEC §2b: "does not exist in the UI until the Launch Rail is built"
 * — App.tsx gates rendering this the same way it gates SoundingMissionPanel. */
export function ContractsPanel() {
  const contracts = useGameStore(useShallow((s) => s.contracts));
  const now = useNow();

  const pendingOffers = contracts.offers.filter((o) => isOfferPending(o, contracts, now));
  const active = activePendingContracts(contracts);

  if (pendingOffers.length === 0 && active.length === 0) return null;

  return (
    <div className="research-panel contracts-panel">
      <div className="research-panel__header">Contracts</div>
      <div className="research-branch">
        {pendingOffers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} now={now} />
        ))}
        {active.map((a) => {
          const offer = contracts.offers.find((o) => o.id === a.offerId);
          if (!offer) return null;
          const deadlineRemaining = a.acceptedAt + CONTRACT_TIERS[offer.tier].fulfillmentDeadlineMs - now;
          return <ActiveContractRow key={a.offerId} client={offer.client} deadlineRemaining={deadlineRemaining} />;
        })}
      </div>
    </div>
  );
}
