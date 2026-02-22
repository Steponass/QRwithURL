/**
 *
 * Displayed in place of a paid-tier feature (e.g. device breakdown,
 * country chart, heatmap) when the user is on the free plan.
 *
 * Design principle: tell the user WHAT they're missing, not just
 * "upgrade to see more". A user who sees "See which devices your
 * visitors use" is more likely to upgrade than one who sees a
 * generic "locked" icon.
 */


interface UpgradePromptProps {
  /** The feature name shown as a heading: "Devices", "Countries", etc. */
  featureTitle: string;
  /** A short description of what the feature shows */
  description: string;
}


export function UpgradePrompt({ featureTitle, description }: UpgradePromptProps) {
  return (
    <section>
      <h3 style={{ marginBottom: "0.5rem" }}>{featureTitle}</h3>
      <div>
        <p>
          {description}
        </p>
        <p>
          Available on Pro plan
        </p>
      </div>
    </section>
  );
}
