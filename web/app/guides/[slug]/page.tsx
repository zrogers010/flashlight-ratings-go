import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

type GuideContent = {
  title: string;
  description: string;
  category: string;
  body: React.ReactNode;
};

const guides: Record<string, GuideContent> = {
  "how-we-score": {
    title: "How We Score Flashlights",
    description:
      "A transparent breakdown of our 5-dimension scoring algorithm — what we measure, how we weight it, and why.",
    category: "Methodology",
    body: (
      <>
        <p>
          Every flashlight on this site is scored across five profiles:{" "}
          <strong>Tactical</strong>, <strong>EDC</strong>, <strong>Value</strong>,{" "}
          <strong>Throw</strong>, and <strong>Flood</strong>. Each profile uses a
          weighted formula tuned to what actually matters for that use case. There
          is no single &ldquo;best flashlight&rdquo; — only the best flashlight{" "}
          <em>for a specific job</em>.
        </p>

        <h2>The Five Scoring Profiles</h2>

        <h3>Tactical Score</h3>
        <p>
          Optimized for duty, defense, and law enforcement. This profile rewards
          lights that can positively identify threats at distance and keep running
          under harsh conditions.
        </p>
        <ul>
          <li><strong>Candela (30%)</strong> — Peak beam intensity determines how far the hotspot reaches and how effectively it can disorient.</li>
          <li><strong>Runtime on High (20%)</strong> — A tactical light that dies mid-shift is a liability.</li>
          <li><strong>Durability (20%)</strong> — Composite of waterproof rating and impact resistance. IPX8 and 1m+ drop rating are baseline.</li>
          <li><strong>Throw Sub-Score (20%)</strong> — Rewards lights with long effective beam distance, factoring in candela and beam reach together.</li>
          <li><strong>Price (10%)</strong> — Lower price is better, but it&rsquo;s intentionally low-weighted — reliability matters more than savings on a duty light.</li>
        </ul>

        <h3>EDC Score</h3>
        <p>
          Tuned for everyday pocket carry — the light you grab for dog walks,
          checking the crawlspace, or navigating a parking garage.
        </p>
        <ul>
          <li><strong>Medium-Mode Runtime (30%)</strong> — EDC lights spend most of their life on medium. A 4+ hour medium mode means charging once a week instead of daily.</li>
          <li><strong>Price (20%)</strong> — EDC users are more price-sensitive. You want good-enough performance without overpaying.</li>
          <li><strong>Flood Sub-Score (20%)</strong> — Everyday tasks need wide, even illumination more than a pencil beam.</li>
          <li><strong>Lumens (15%)</strong> — Enough output to light up a room, but diminishing returns past ~1500 lm for pocket use.</li>
          <li><strong>Durability (15%)</strong> — A pocket light gets dropped. It needs to survive.</li>
        </ul>

        <h3>Throw Score</h3>
        <p>
          For search and rescue, long-range identification, and dedicated throwers.
        </p>
        <ul>
          <li><strong>Candela (45%)</strong> — The dominant factor. Throw is fundamentally a function of beam intensity.</li>
          <li><strong>Beam Distance (30%)</strong> — Rated ANSI throw distance in meters. Closely correlated with candela but penalizes inefficient reflectors.</li>
          <li><strong>Runtime on High (15%)</strong> — Extended search operations need sustained output.</li>
          <li><strong>Durability (10%)</strong> — Field use demands weather and impact resistance.</li>
        </ul>

        <h3>Flood Score</h3>
        <p>
          For camping, area illumination, and any scenario where you need to light
          up a wide space evenly.
        </p>
        <ul>
          <li><strong>Lumens (50%)</strong> — Raw output is king for flood. More lumens means more area covered.</li>
          <li><strong>Medium-Mode Runtime (25%)</strong> — Camp lights run for hours. A short runtime on medium defeats the purpose.</li>
          <li><strong>Price (15%)</strong> — Camping lights are often shared or left in a gear bag. Reasonable cost matters.</li>
          <li><strong>Durability (10%)</strong> — Rain resistance and basic impact survival.</li>
        </ul>

        <h3>Value Score</h3>
        <p>
          A composite score that balances raw performance against price. It answers:
          &ldquo;How much flashlight do I get per dollar?&rdquo;
        </p>
        <ul>
          <li><strong>Performance (60%)</strong> — An internal sub-score combining lumens (35%), candela (25%), high-mode runtime (20%), and durability (20%).</li>
          <li><strong>Price (40%)</strong> — Lower price is heavily rewarded, making this the go-to ranking for budget-conscious buyers.</li>
        </ul>

        <h2>Normalization</h2>
        <p>
          Raw specs vary wildly — 200 lumens vs 100,000 lumens, $25 vs $670. We
          normalize every metric to a 0–1 scale before applying weights.
          Performance metrics (lumens, candela, beam distance, runtime) use{" "}
          <strong>logarithmic normalization</strong> to prevent extreme outliers
          from dominating. Price uses{" "}
          <strong>linear inverse normalization</strong> — cheaper is better, on a
          straight scale.
        </p>

        <h2>Durability Sub-Score</h2>
        <p>
          Durability is a composite of two specs: waterproof rating and impact
          resistance. An IPX8-rated light with 2m impact resistance scores
          significantly higher than an IPX4-rated light with no drop rating. This
          score feeds into every profile because a flashlight that breaks when you
          need it most is worthless regardless of how bright it is.
        </p>

        <h2>Why Not Just Sort by Lumens?</h2>
        <p>
          Lumens alone tell you almost nothing useful. A 10,000-lumen light with a
          30-second turbo stepdown and no waterproofing is worse for camping than a
          1,200-lumen light that runs for 6 hours and survives rain. Our scoring
          system captures these tradeoffs so you can compare flashlights the way
          they actually get used — not just by the biggest number on the box.
        </p>
      </>
    ),
  },

  "throw-vs-flood": {
    title: "Throw vs Flood Explained",
    description:
      "Understanding the difference between candela (throw) and lumens (flood), and which matters more for your use case.",
    category: "Fundamentals",
    body: (
      <>
        <p>
          The two most important flashlight specs — lumens and candela — measure
          fundamentally different things. Understanding the distinction is the
          single most useful thing you can learn before buying a flashlight.
        </p>

        <h2>Lumens: Total Light Output</h2>
        <p>
          Lumens measure the <strong>total amount of light</strong> emitted in all
          directions. A 3,000-lumen flashlight produces three times as much total
          light as a 1,000-lumen flashlight. But lumens say nothing about{" "}
          <em>where</em> that light goes.
        </p>
        <p>
          A lantern and a spotlight can both produce 1,000 lumens. The lantern
          spreads it evenly in 360 degrees (great for illuminating a campsite);
          the spotlight focuses it into a narrow cone (great for seeing something
          200 meters away). Same lumens, completely different beam patterns.
        </p>

        <h2>Candela: Beam Intensity</h2>
        <p>
          Candela measures <strong>light intensity in a single direction</strong>{" "}
          — specifically, peak intensity at the center of the beam. High candela
          means a tight, focused hotspot that reaches far. This is what
          determines <strong>throw</strong>: how far away you can identify objects.
        </p>
        <p>
          The ANSI beam distance formula is straightforward:{" "}
          <code>distance = 2 × √candela</code> meters, measured to the point
          where illumination equals a full moon (0.25 lux). A light with 60,000
          candela throws about 490 meters.
        </p>

        <h2>Reflector and Optic Design</h2>
        <p>
          The reflector (or TIR optic) determines how lumens get converted into a
          beam pattern. Three key factors:
        </p>
        <ul>
          <li><strong>Deep, smooth reflector</strong> — Concentrates light into a narrow hotspot with high candela. Great throw, tight spill. Think: dedicated throwers like the Lumintop GT Mini Pro.</li>
          <li><strong>Shallow, orange-peel reflector</strong> — Spreads light into a wider, softer beam. Lower candela, broader coverage. Think: EDC and flood lights like the Acebeam E75.</li>
          <li><strong>TIR (Total Internal Reflection) optic</strong> — Uses a lens instead of a reflector. Produces a clean, artifact-free beam with well-defined edges. Common in tactical lights like SureFire models.</li>
        </ul>

        <h2>Which Do You Need?</h2>
        <table className="spec-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Use Case</th>
              <th>Priority</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Search &amp; Rescue</td>
              <td>Throw (candela)</td>
              <td>Identifying people or terrain at 200m+ in open areas</td>
            </tr>
            <tr>
              <td>Camping</td>
              <td>Flood (lumens)</td>
              <td>Lighting up a campsite or trail close-range</td>
            </tr>
            <tr>
              <td>EDC / Walking</td>
              <td>Balanced</td>
              <td>Enough throw to see ahead, enough flood for close tasks</td>
            </tr>
            <tr>
              <td>Tactical / Defense</td>
              <td>Throw (candela)</td>
              <td>Positive ID at distance, disorienting output</td>
            </tr>
            <tr>
              <td>Indoor / Workshop</td>
              <td>Flood (lumens)</td>
              <td>Wide, even coverage without blinding hotspot</td>
            </tr>
          </tbody>
        </table>

        <h2>The Hybrid Sweet Spot</h2>
        <p>
          Most general-purpose flashlights aim for a &ldquo;hybrid&rdquo; beam
          pattern — a defined hotspot surrounded by useful spill. These won&rsquo;t
          out-throw a dedicated thrower or out-flood a mule, but they handle 90%
          of real-world tasks well. If you&rsquo;re buying one flashlight, a hybrid
          beam is usually the right call.
        </p>
        <p>
          On this site, we label beam patterns as <strong>throw</strong>,{" "}
          <strong>flood</strong>, or <strong>hybrid</strong> in every listing so
          you know what to expect before you buy.
        </p>
      </>
    ),
  },

  "battery-guide": {
    title: "Flashlight Battery Guide: 18650 vs 21700 vs CR123A",
    description:
      "Comparing the most common flashlight batteries — capacity, size, availability, and which lights use them.",
    category: "Hardware",
    body: (
      <>
        <p>
          The battery inside a flashlight matters as much as the LED. It
          determines runtime, output stability, size, and long-term cost. Here is
          a practical comparison of the three most common flashlight battery
          formats.
        </p>

        <h2>18650</h2>
        <p>
          The most popular rechargeable flashlight battery. The name describes its
          dimensions: 18mm diameter × 65mm length (roughly the size of a AA
          battery, but fatter and longer).
        </p>
        <ul>
          <li><strong>Capacity:</strong> 2,600–3,600 mAh typical</li>
          <li><strong>Voltage:</strong> 3.6V nominal (4.2V charged)</li>
          <li><strong>Best for:</strong> EDC, tactical, and general-purpose lights</li>
          <li><strong>Pros:</strong> Widely available, good energy density, fits pocket-sized lights. Thousands of charge cycles.</li>
          <li><strong>Cons:</strong> Not available at gas stations. Requires a charger (or USB-C on the light).</li>
        </ul>
        <p>
          The 18650 is the default recommendation. Most lights in the $30–$150
          range use this cell, and quality cells from Samsung, Sony/Murata, and
          LG cost $5–8 each and last for years.
        </p>

        <h2>21700</h2>
        <p>
          The newer, larger alternative: 21mm × 70mm. Originally developed for
          electric vehicles (Tesla Model 3), now increasingly common in
          flashlights.
        </p>
        <ul>
          <li><strong>Capacity:</strong> 4,000–5,000 mAh typical</li>
          <li><strong>Voltage:</strong> 3.6V nominal</li>
          <li><strong>Best for:</strong> High-output lights, throwers, and lights where extended runtime matters</li>
          <li><strong>Pros:</strong> 40–50% more capacity than 18650. Supports higher sustained current for brighter sustained output.</li>
          <li><strong>Cons:</strong> Slightly larger and heavier. Fewer options at retail. Light bodies are a bit wider (~28mm vs ~25mm tube).</li>
        </ul>
        <p>
          If size is not your top priority, 21700 is the better cell. The extra
          runtime and current capacity are meaningful, and the size penalty is
          small — most 21700 lights still fit comfortably in a pocket.
        </p>

        <h2>CR123A</h2>
        <p>
          A 3V lithium primary (non-rechargeable) cell. Shorter and fatter than
          an 18650. Common in SureFire and other legacy tactical platforms.
        </p>
        <ul>
          <li><strong>Capacity:</strong> ~1,500 mAh</li>
          <li><strong>Voltage:</strong> 3.0V nominal</li>
          <li><strong>Best for:</strong> Backup and long-term storage lights</li>
          <li><strong>Pros:</strong> 10-year shelf life. Works in extreme cold. Compact. Available at many hardware stores.</li>
          <li><strong>Cons:</strong> Expensive per use ($2–5 each, not rechargeable). Low capacity means short runtime at high output. Two cells often required.</li>
        </ul>
        <p>
          CR123A lights are best for &ldquo;stash it and forget it&rdquo;
          scenarios — a glove box light, emergency kit, or weapon-mounted light
          that needs to work after sitting unused for years. For daily use, the
          cost-per-hour is dramatically higher than rechargeable cells.
        </p>

        <h2>Dual-Fuel Lights</h2>
        <p>
          Many modern tactical lights accept <em>both</em> an 18650 and two
          CR123A cells. This gives you the best of both worlds: rechargeable for
          daily use, disposable lithium for backup. If this flexibility matters,
          look for &ldquo;dual fuel&rdquo; in the listing specs.
        </p>

        <h2>Quick Comparison</h2>
        <table className="spec-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Spec</th>
              <th>18650</th>
              <th>21700</th>
              <th>CR123A</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Diameter</td><td>18 mm</td><td>21 mm</td><td>17 mm</td></tr>
            <tr><td>Length</td><td>65 mm</td><td>70 mm</td><td>34 mm</td></tr>
            <tr><td>Capacity</td><td>2,600–3,600 mAh</td><td>4,000–5,000 mAh</td><td>~1,500 mAh</td></tr>
            <tr><td>Rechargeable</td><td>Yes</td><td>Yes</td><td>No</td></tr>
            <tr><td>Shelf Life</td><td>~1 year (charged)</td><td>~1 year (charged)</td><td>10 years</td></tr>
            <tr><td>Cost per Cell</td><td>$5–8</td><td>$6–10</td><td>$2–5 (single use)</td></tr>
          </tbody>
        </table>

        <h2>Our Recommendation</h2>
        <p>
          For most people: buy a light with <strong>USB-C charging</strong> that
          uses an <strong>18650 or 21700</strong> cell (included). You will never
          need to buy batteries separately. Plug it in like your phone. If you
          need a backup light for emergencies, get a small CR123A-powered option
          and leave it in your kit.
        </p>
      </>
    ),
  },

  "runtime-explained": {
    title: "Runtime Numbers Explained",
    description:
      "Why manufacturer runtime claims can be misleading, how step-down works, and how to read our runtime tables.",
    category: "Specs",
    body: (
      <>
        <p>
          A flashlight claiming &ldquo;6 hours of runtime&rdquo; might only
          deliver full brightness for the first 90 seconds. Understanding how
          runtime is measured — and how step-down works — is essential for
          comparing flashlights honestly.
        </p>

        <h2>The ANSI FL1 Standard</h2>
        <p>
          The ANSI/NEMA FL1 standard defines runtime as the time from turn-on
          (with fresh batteries) until output drops to <strong>10% of initial
          output</strong>. This sounds reasonable, but it creates a loophole:
          a light that starts at 3,000 lumens and immediately steps down to 500
          lumens still counts every minute at 500 lumens as part of its
          &ldquo;runtime.&rdquo;
        </p>
        <p>
          The result: a light advertising 3,000 lumens and 4 hours of runtime
          might deliver 3,000 lumens for 2 minutes and 500 lumens for the
          remaining 3 hours and 58 minutes. Technically accurate. Practically
          misleading.
        </p>

        <h2>Turbo Step-Down</h2>
        <p>
          Almost every high-output flashlight reduces brightness after a short
          burst on its highest (&ldquo;turbo&rdquo;) mode. This is called{" "}
          <strong>step-down</strong>, and it exists for two reasons:
        </p>
        <ol>
          <li><strong>Heat:</strong> A small aluminum tube generating 3,000+ lumens gets dangerously hot within 30–120 seconds. Step-down protects the LED, driver, and your hand.</li>
          <li><strong>Battery protection:</strong> High drain rates reduce effective capacity and can damage cells. Stepping down extends total energy delivered.</li>
        </ol>
        <p>
          Step-down timing varies: budget lights may step down in 30 seconds;
          well-engineered lights with good thermal mass can sustain turbo for 2–3
          minutes. We list step-down times in seconds where available.
        </p>

        <h2>Which Runtime Number Matters?</h2>
        <p>
          The runtime number that matters most depends on how you use the light:
        </p>
        <ul>
          <li><strong>High-mode runtime</strong> — The primary metric for tactical and search use, where you need sustained bright output. This is the time at the highest <em>regulated, non-stepping</em> output level.</li>
          <li><strong>Medium-mode runtime</strong> — The primary metric for EDC and camping. This is where you spend 90% of your battery life in daily use.</li>
          <li><strong>Turbo runtime</strong> — Only relevant for momentary bursts. Treat turbo as a &ldquo;boost button,&rdquo; not a sustained mode.</li>
        </ul>

        <h2>How We Handle Runtime in Scoring</h2>
        <p>
          Our scoring engine uses <strong>high-mode runtime</strong> for tactical
          and throw profiles, and <strong>medium-mode runtime</strong> for EDC
          and flood profiles. We never use turbo-mode runtime for scoring because
          it is not a sustainable output level.
        </p>
        <p>
          When comparing flashlights on this site, look at the runtime column in
          context of the output level. A light with 2 hours on high at 800 lumens
          is more useful than a light with 2 hours on high at 200 lumens — but
          both show &ldquo;2 hrs&rdquo; in the runtime field.
        </p>

        <h2>Practical Tips</h2>
        <ul>
          <li>If a light only lists runtime on its lowest mode, be suspicious — they may be hiding a poor high-mode runtime.</li>
          <li>USB-C rechargeable lights let you top off daily, making medium-mode runtime less critical for EDC.</li>
          <li>For emergency lights, total energy (mAh × voltage) matters more than mode-specific runtime. Bigger battery = more total light.</li>
          <li>Temperature matters: lithium-ion cells lose 20–40% capacity in freezing conditions. CR123A primaries handle cold much better.</li>
        </ul>
      </>
    ),
  },

  "ip-ratings": {
    title: "Understanding IP Ratings for Flashlights",
    description:
      "What IPX4, IPX8, and IP68 actually mean in practice, and how much waterproofing you really need.",
    category: "Durability",
    body: (
      <>
        <p>
          IP ratings (Ingress Protection) tell you how well a flashlight resists
          dust and water. The rating has two digits: the first for solids (dust),
          the second for liquids (water). When you see &ldquo;IPX8,&rdquo; the X
          means dust protection was not tested — only water.
        </p>

        <h2>Common Flashlight IP Ratings</h2>
        <table className="spec-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Rating</th>
              <th>Water Protection</th>
              <th>Practical Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>IPX4</strong></td>
              <td>Splash-proof</td>
              <td>Survives rain and splashes from any direction. Do not submerge.</td>
            </tr>
            <tr>
              <td><strong>IPX7</strong></td>
              <td>Temporary immersion</td>
              <td>Survives 30 minutes at 1 meter depth. Drop it in a puddle or stream — it will be fine.</td>
            </tr>
            <tr>
              <td><strong>IPX8</strong></td>
              <td>Continuous immersion</td>
              <td>Rated for submersion beyond 1 meter (manufacturer specifies depth and duration). The standard for serious outdoor and tactical lights.</td>
            </tr>
            <tr>
              <td><strong>IP67</strong></td>
              <td>Dust-tight + temporary immersion</td>
              <td>Complete dust protection plus 30 min at 1m depth.</td>
            </tr>
            <tr>
              <td><strong>IP68</strong></td>
              <td>Dust-tight + continuous immersion</td>
              <td>Complete dust protection plus extended submersion. The highest practical rating for flashlights.</td>
            </tr>
          </tbody>
        </table>

        <h2>IPX7 vs IPX8: What is the Real Difference?</h2>
        <p>
          IPX7 guarantees survival at 1 meter for 30 minutes — a well-defined
          test. IPX8 means &ldquo;better than IPX7&rdquo; but the exact depth and
          duration are set by the manufacturer. Some IPX8 lights are rated for 2
          meters, others for 100+ feet. Always check the manufacturer&rsquo;s
          specific claim, not just the IP code.
        </p>

        <h2>Do You Need IP68?</h2>
        <p>
          For most people, <strong>IPX7 or IPX8 is sufficient</strong>. Here is a
          practical guide:
        </p>
        <ul>
          <li><strong>EDC / urban carry:</strong> IPX4 is enough. You need rain protection, not submersion.</li>
          <li><strong>Camping / hiking:</strong> IPX7 minimum. You will encounter heavy rain, creek crossings, and the inevitable drop into water.</li>
          <li><strong>Tactical / duty:</strong> IPX8 minimum. Duty lights must work in any condition without hesitation.</li>
          <li><strong>Diving / water rescue:</strong> IP68 with a manufacturer depth rating. This is a specialized need — most IP68 flashlights are not rated for actual diving depths.</li>
        </ul>

        <h2>Impact Resistance</h2>
        <p>
          IP ratings only cover water and dust — not drops. Impact resistance is
          rated separately, typically as a drop height in meters. A light rated
          for &ldquo;1m impact resistance&rdquo; has been tested surviving drops
          onto concrete from 1 meter, 6 times (once per face).
        </p>
        <ul>
          <li><strong>1.0m:</strong> Standard for most quality flashlights. Survives a hip-height drop onto hard ground.</li>
          <li><strong>1.5m:</strong> Good for outdoor and tactical use. Survives drops from a raised hand.</li>
          <li><strong>2.0m+:</strong> Premium durability. Elzetta and Cloud Defensive models are rated at 3m — built for weapon-mounted recoil abuse.</li>
        </ul>

        <h2>How We Score Durability</h2>
        <p>
          Our scoring engine combines waterproof rating and impact resistance into
          a single durability sub-score that feeds into every profile. A light
          with IPX8 + 2m impact resistance scores near the top; a light with IPX4
          and no impact rating scores near the bottom. This ensures fragile
          lights are penalized even if their raw specs look impressive on paper.
        </p>
      </>
    ),
  },

  "best-edc-weight": {
    title: "Best Weight Range for EDC Flashlights",
    description:
      "Why 60–110g is the sweet spot for pocket carry, and how body shape and clip quality factor in.",
    category: "EDC",
    body: (
      <>
        <p>
          The best flashlight is the one you actually carry. And nothing kills
          carry consistency faster than a light that is too heavy, too long, or
          too bulky for your pocket. After analyzing dozens of popular EDC lights,
          the sweet spot for daily pocket carry is clear:{" "}
          <strong>60–110 grams with battery</strong>.
        </p>

        <h2>Why Weight Matters</h2>
        <p>
          An EDC flashlight competes for pocket space with your phone, keys, and
          wallet. If it drags your pants down or creates an obvious bulge, you
          will leave it at home. The difference between 80g and 180g sounds small
          on paper but is immediately obvious in a front pocket.
        </p>
        <p>
          For context: a Sofirn SP35 (130g with battery) is comfortable but
          noticeable. A Wurkkos FC11C (112g) practically disappears. An Olight
          Warrior 3S (176g) needs a good belt clip or it pulls at your pocket
          all day.
        </p>

        <h2>The Weight-Output Tradeoff</h2>
        <p>
          Lighter lights use smaller batteries (18650 or smaller), which limits
          both sustained output and runtime. There is no free lunch:
        </p>
        <ul>
          <li><strong>Under 60g:</strong> Keychain-class (RovyVon Aurora, Nitecore TIP). Limited to ~650 lumens and 1 hour runtime. Great as a backup, not a primary.</li>
          <li><strong>60–110g:</strong> The EDC sweet spot. 18650-powered lights deliver 1,000–2,000 lumens with 2–4 hour medium-mode runtime. Examples: Skilhunt M200, Wurkkos FC11C, Lumintop FW3A.</li>
          <li><strong>110–160g:</strong> Full-size EDC. 21700-powered lights with 2,000–3,000 lumens and longer runtime. Pocketable with a good clip but you will feel it. Examples: Fenix PD36R Pro, Sofirn SP35.</li>
          <li><strong>160g+:</strong> Duty-class. These are tactical or thrower lights, not pocket lights. Great performance, but EDC only with belt carry or a holster.</li>
        </ul>

        <h2>Length and Diameter</h2>
        <p>
          Weight is the primary comfort factor, but dimensions matter too:
        </p>
        <ul>
          <li><strong>Length under 120mm</strong> — Sits inside a jeans pocket without poking out. Over 140mm gets awkward for sitting.</li>
          <li><strong>Body diameter 24–26mm</strong> — Comfortable to hold, fits standard pocket clips. This is the 18650 sweet spot.</li>
          <li><strong>Head diameter under 30mm</strong> — Wider heads create pocket bulge and snag on fabric.</li>
        </ul>

        <h2>Clip Quality is Underrated</h2>
        <p>
          A deep-carry pocket clip is the single most important EDC feature
          after the light itself. A good clip:
        </p>
        <ul>
          <li>Holds the light bezel-down with only the clip tip visible above the pocket seam</li>
          <li>Has enough tension to stay put during movement without being impossible to pull out</li>
          <li>Is reversible (bezel-up or bezel-down carry)</li>
        </ul>
        <p>
          Cheap clips that bend, pop off, or let the light ride high in the
          pocket will make you stop carrying the light within a week. This is
          one area where spending more on a reputable brand pays off — Zebralight,
          Skilhunt, and Fenix consistently ship with excellent clips.
        </p>

        <h2>Our EDC Scoring and Weight</h2>
        <p>
          Our EDC score does not directly weight grams — instead, it emphasizes
          the traits that correlate with good pocket carry: long medium-mode
          runtime (which favors efficient, moderate-output lights), reasonable
          price, good flood coverage, and durability. In practice, lights in the
          60–110g range tend to score highest because they hit the optimal balance
          of these factors without the diminishing returns of chasing maximum
          lumens.
        </p>
      </>
    ),
  },
};

const guideSlugs = Object.keys(guides);

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides[slug];
  if (!guide) return {};
  return {
    title: `${guide.title} — Flashlight Ratings`,
    description: guide.description,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = guides[slug];
  if (!guide) notFound();

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Guides", href: "/guides" },
          { name: guide.title },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Guides", href: "/guides" },
          { label: guide.title },
        ]}
      />

      <article className="panel" style={{ maxWidth: 740, margin: "0 auto" }}>
        <span className="badge badge-teal" style={{ marginBottom: 12 }}>
          {guide.category}
        </span>
        <h1 style={{ marginBottom: 8 }}>{guide.title}</h1>
        <p className="muted" style={{ marginBottom: 32, fontSize: "1.05rem" }}>
          {guide.description}
        </p>
        <div className="guide-body">{guide.body}</div>
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          <Link href="/guides" className="btn btn-ghost btn-sm">
            ← All Guides
          </Link>
        </div>
      </article>
    </section>
  );
}
