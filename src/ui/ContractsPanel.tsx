import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { activePendingContracts, isOfferPending } from '../core/contracts';
import {
  CONTRACT_TIERS,
  SATELLITE_BUILD,
  TIER0_PAYLOAD_EXTRA_HARDWARE,
  TIER0_PAYLOAD_EXTRA_PROPELLANT,
} from '../data/contracts';
import { SOUNDING_ROCKETS } from '../data/soundingRockets';
import { formatDuration } from '../core/format';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
import type { ActiveContract, ContractOffer, PadId } from '../core/types';

const TIER0_COST = {
  hardware: SOUNDING_ROCKETS.s1.assemblyHardware + TIER0_PAYLOAD_EXTRA_HARDWARE,
  propellant: SOUNDING_ROCKETS.s1.launchPropellant + TIER0_PAYLOAD_EXTRA_PROPELLANT,
};

function tierRewardText(tier: 0 | 1 | 2): string {
  const r = CONTRACT_TIERS[tier].reward;
  return tier === 0
    ? `${r.funding} + ${r.reputation} Reputation`
    : `$${r.funding.toLocaleString()} + ${r.reputation} Reputation`;
}

function OfferCard({ offer, now }: { offer: ContractOffer; now: number }) {
  const acceptContractOffer = useGameStore((s) => s.acceptContractOffer);
  const remaining = offer.offeredAt + offer.deadlineMs - now;

  const requirement =
    offer.tier === 0 ? (
      <>
        Fly their instrument package on an S-1. All-inclusive: <CostLabel cost={TIER0_COST} />.
      </>
    ) : (
      (() => {
        const build = SATELLITE_BUILD[offer.tier as 1 | 2];
        return (
          <>
            {offer.tier === 2 ? 'Constellation batch. ' : 'Single satellite. '}
            Requires <CostLabel cost={{ hardware: build.hardware, propellant: build.propellant }} />
            {build.minHardwareTier ? ` (${build.minHardwareTier} tier)` : ''}, a free pad, Reputation ≥{' '}
            {build.reputationGate}
            {build.requiresCleanRoom ? ', VAB Clean Room' : ''}.
          </>
        );
      })()
    );

  return (
    <div className="research-node">
      <div className="research-node__name">
        {offer.client} (tier {offer.tier})
      </div>
      <div className="research-node__description">
        {requirement} Pays {tierRewardText(offer.tier)}.
      </div>
      <div className="research-node__cost">Offer expires in {formatDuration(Math.max(0, remaining))}</div>
      <button type="button" className="upgrade-button" onClick={() => acceptContractOffer(offer.id)}>
        Accept
      </button>
    </div>
  );
}

function ActiveContractRow({
  contract,
  offer,
  deadlineRemaining,
  emptyPads,
}: {
  contract: ActiveContract;
  offer: ContractOffer;
  deadlineRemaining: number;
  emptyPads: PadId[];
}) {
  const startContractStage = useGameStore((s) => s.startContractStage);

  return (
    <div className="research-node research-node--done">
      <div className="research-node__name">
        {offer.client} (tier {offer.tier})
      </div>
      {offer.tier === 0 ? (
        <div className="research-node__description">
          Accepted — deliver via a linked S-1 flight in Testing before the deadline.
        </div>
      ) : contract.padId ? (
        <div className="research-node__description">
          Building on Pad {contract.padId === 'padA' ? 'A' : 'B'} — see the Launch Sequence panel.
        </div>
      ) : (
        <div className="research-node__description">
          Accepted — pick a free pad to start building the payload.
          {emptyPads.length === 0 && ' No pad is free right now.'}
        </div>
      )}
      <div className="research-node__cost">Deadline: {formatDuration(Math.max(0, deadlineRemaining))}</div>
      {offer.tier !== 0 && !contract.padId && emptyPads.length > 0 && (
        <div className="research-node__actions">
          {emptyPads.map((padId) => (
            <button
              key={padId}
              type="button"
              className="upgrade-button"
              onClick={() => startContractStage(padId, offer.id)}
            >
              Build on Pad {padId === 'padA' ? 'A' : 'B'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ECONOMY §10 / UI_SPEC §2b: "does not exist in the UI until the Launch Rail is built"
 * — App.tsx gates rendering this the same way it gates SoundingMissionPanel. Sprint 9
 * adds tier-1/2 offers/active rows once Payload Processing exists; the panel itself stays
 * mounted from Launch Rail onward exactly as before. */
export function ContractsPanel() {
  const contracts = useGameStore(useShallow((s) => s.contracts));
  const pads = useGameStore(useShallow((s) => s.mission.pads));
  const now = useNow();

  const pendingOffers = contracts.offers.filter((o) => isOfferPending(o, contracts, now));
  const active = activePendingContracts(contracts);
  const emptyPads = (Object.keys(pads) as PadId[]).filter((id) => {
    const pad = pads[id];
    return pad && pad.rocketStatus === 'none' && pad.contractId == null;
  });

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
          return (
            <ActiveContractRow
              key={a.offerId}
              contract={a}
              offer={offer}
              deadlineRemaining={deadlineRemaining}
              emptyPads={emptyPads}
            />
          );
        })}
      </div>
    </div>
  );
}
