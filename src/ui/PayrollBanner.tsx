import { useGameStore } from '../state/persistStore';

// GDD §1b / UI_SPEC §4: persistent banner while staffed production is paused for
// insolvency; auto-clears the instant salaries can be paid again.
export function PayrollBanner() {
  const payrollUnpaid = useGameStore((s) => s.economyFlags.payrollUnpaid);
  if (!payrollUnpaid) return null;

  return (
    <div className="payroll-banner" role="status">
      PAYROLL UNPAID — staffed production is paused. Pitch to raise Funding and resume.
    </div>
  );
}
