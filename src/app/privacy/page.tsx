import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";

// Privacy Policy. Copy provided by Todd Bryson — rendered verbatim.
// Replaces the "Privacy Policy (coming)" placeholder in the site footer.
// Update LAST_UPDATED when material changes ship.

export const metadata: Metadata = {
  title: "Privacy Policy — CDLA.jobs",
  description:
    "How CDLA.jobs collects, uses, shares, and protects personal information for CDL-A drivers, carriers, and recruiting partners.",
  alternates: { canonical: "https://cdla.jobs/privacy" },
};

const LAST_UPDATED = "May 25, 2026";

export default function PrivacyPage() {
  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-brand-muted">
            Effective date: {LAST_UPDATED}
          </p>
        </header>

        <div className="mt-10 space-y-5 text-base leading-7 text-brand-ink">
          <p>
            At <strong>CDLA.jobs</strong>, located at{" "}
            <strong>5300 Sagewood Dr. H552, Park City, UT 84098</strong>, we
            are committed to protecting the privacy of our website visitors,
            CDL-A drivers, carrier partners, recruiters, and other users of
            our services.
          </p>
          <p>
            This Privacy Policy explains how we collect, use, share, and
            protect personal information when you visit our website, submit
            information through our forms, use our driver-matching services,
            communicate with us, or interact with our carrier and recruiting
            workflows.
          </p>
          <p>
            By using CDLA.jobs, you agree to the practices described in this
            Privacy Policy.
          </p>

          <Section title="Information We Collect">
            <p>
              We may collect personal information that you voluntarily
              provide to us through our website, forms, intake pages, lead
              forms, carrier requests, emails, phone calls, text messages, or
              other communications.
            </p>
            <p>This may include:</p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>City, state, ZIP code, or general location</li>
              <li>CDL status</li>
              <li>CDL class</li>
              <li>Endorsements</li>
              <li>Driving experience</li>
              <li>Equipment or trailer experience</li>
              <li>
                Preferred driving type, such as local, regional, OTR,
                dedicated, flatbed, reefer, dry van, tanker, or other
                categories
              </li>
              <li>Home-time preferences</li>
              <li>Work history or prior employer information</li>
              <li>Safety-related answers provided during driver intake</li>
              <li>
                MVR-related disclosures voluntarily provided by the driver
              </li>
              <li>
                Criminal history disclosures voluntarily provided by the
                driver
              </li>
              <li>Job preferences</li>
              <li>Carrier preferences</li>
              <li>
                Consent choices related to sharing information with specific
                carriers
              </li>
              <li>Any other information you choose to provide</li>
            </ul>
            <p>
              For carrier partners, recruiters, or business users, we may
              collect:
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>Company name</li>
              <li>Contact name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Fleet size</li>
              <li>Hiring locations</li>
              <li>Hiring criteria</li>
              <li>Job openings or hiring needs</li>
              <li>ATS or CRM information</li>
              <li>Website or careers page URL</li>
              <li>Billing or onboarding information, where applicable</li>
            </ul>
          </Section>

          <Section title="Technical Information We Collect">
            <p>
              When you visit our website, we may automatically collect
              certain technical information, including:
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device type</li>
              <li>Operating system</li>
              <li>Pages visited</li>
              <li>Referring website</li>
              <li>Date and time of visit</li>
              <li>General usage activity</li>
              <li>Cookies or similar tracking technologies</li>
            </ul>
            <p>
              We use this information to improve website performance,
              understand user behavior, prevent fraud or abuse, improve our
              matching and intake process, and maintain the security of our
              services.
            </p>
          </Section>

          <Section title="How We Use Your Information">
            <p>We may use the information we collect to:</p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>Respond to inquiries</li>
              <li>Provide driver-matching services</li>
              <li>Match CDL-A drivers with carrier opportunities</li>
              <li>
                Evaluate driver preferences against carrier hiring criteria
              </li>
              <li>
                Send driver information to carriers when the driver has
                provided consent
              </li>
              <li>
                Deliver prequalification information into carrier recruiting
                workflows or applicant tracking systems
              </li>
              <li>
                Communicate with drivers about potential job opportunities
              </li>
              <li>
                Communicate with carriers about driver leads, onboarding, or
                service updates
              </li>
              <li>
                Improve our website, forms, matching process, and user
                experience
              </li>
              <li>Send service-related messages</li>
              <li>Send marketing or informational messages, where permitted</li>
              <li>Track performance, lead quality, and service usage</li>
              <li>
                Maintain records of consent and communication preferences
              </li>
              <li>
                Comply with legal, regulatory, or operational requirements
              </li>
              <li>
                Prevent fraud, misuse, unauthorized access, or other
                prohibited activity
              </li>
            </ul>
            <p>
              CDLA.jobs is not a motor carrier and does not make final hiring
              decisions. Final hiring, qualification, screening, background
              checks, MVR review, drug testing, DOT compliance, and
              employment decisions remain the responsibility of the carrier
              or hiring party.
            </p>
          </Section>

          <Section title="Driver Consent and Sharing With Carriers">
            <p>
              CDLA.jobs is built around driver choice and carrier-specific
              consent.
            </p>
            <p>
              When a driver submits information through CDLA.jobs, we may use
              that information to identify potential matches with
              participating carriers or recruiting partners.
            </p>
            <p>
              When a driver selects, requests, or consents to share
              information with a specific carrier or opportunity, CDLA.jobs
              may share that driver&rsquo;s submitted information with that
              carrier, recruiter, applicant tracking system, CRM, or related
              hiring workflow.
            </p>
            <p>
              We do not represent that sharing information will result in an
              interview, job offer, qualification approval, or employment.
            </p>
          </Section>

          <Section title="Sharing of Information">
            <p>We may share personal information with:</p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>
                Carriers or recruiters selected by, requested by, or
                consented to by the driver
              </li>
              <li>
                Applicant tracking systems, including carrier recruiting
                systems
              </li>
              <li>
                CRM, email, SMS, form, automation, analytics, and hosting
                providers
              </li>
              <li>Service providers who help us operate CDLA.jobs</li>
              <li>
                Business partners involved in providing driver-matching or
                recruiting support
              </li>
              <li>
                Legal, regulatory, or law enforcement authorities when
                required by law
              </li>
              <li>
                Successors or assigns in connection with a merger, sale,
                acquisition, restructuring, or transfer of business assets
              </li>
            </ul>
            <p>
              We do not sell, rent, or lease personal information to third
              parties as a general business practice.
            </p>
            <p>
              However, drivers should understand that when they consent to
              share their information with a carrier, recruiter, or hiring
              partner, that party may contact them and may process their
              information under its own privacy practices.
            </p>
          </Section>

          <Section title="SMS, Email, and Phone Communications">
            <p>
              By submitting your contact information, you may agree to be
              contacted by CDLA.jobs, participating carriers, recruiters, or
              related hiring partners by phone, email, text message, or
              other communication methods regarding job opportunities,
              recruiting, driver matching, onboarding, or related services.
            </p>
            <p>Message and data rates may apply.</p>
            <p>
              You may opt out of marketing or non-essential communications by
              following unsubscribe instructions, replying STOP to applicable
              text messages, or contacting us directly.
            </p>
            <p>
              Opting out may limit our ability to provide matching or
              recruiting-related services.
            </p>
          </Section>

          <Section title="Cookies and Tracking Technologies">
            <p>
              CDLA.jobs may use cookies, pixels, analytics tools, and similar
              technologies to improve website functionality, measure traffic,
              understand user behavior, improve advertising, and enhance the
              user experience.
            </p>
            <p>
              You may disable cookies through your browser settings, but some
              website features may not function properly if cookies are
              disabled.
            </p>
          </Section>

          <Section title="Data Security">
            <p>
              We use reasonable administrative, technical, and physical
              safeguards to protect personal information from unauthorized
              access, use, disclosure, alteration, or destruction.
            </p>
            <p>
              These safeguards may include secure hosting, access controls,
              encryption where appropriate, password protection, limited
              access to sensitive information, and internal security
              practices.
            </p>
            <p>
              No method of transmission over the internet or electronic
              storage is completely secure. We cannot guarantee absolute
              security.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              We may retain personal information for as long as necessary to
              provide our services, maintain business records, support
              recruiting workflows, comply with legal obligations, resolve
              disputes, enforce agreements, maintain consent records, or
              improve our services.
            </p>
            <p>
              When information is no longer needed, we may delete, anonymize,
              or securely retain it as permitted by law.
            </p>
          </Section>

          <Section title="Your Rights and Choices">
            <p>
              Depending on your location and applicable law, you may have
              the right to:
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>Access personal information we maintain about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your information</li>
              <li>Opt out of certain communications</li>
              <li>
                Withdraw consent where consent is the basis for processing
              </li>
              <li>Ask questions about how your information is used or shared</li>
            </ul>
            <p>To exercise these rights, contact us using the information below.</p>
            <p>
              We may need to verify your identity before processing certain
              requests.
            </p>
          </Section>

          <Section title="Third-Party Websites and Services">
            <p>
              Our website or communications may link to third-party
              websites, carrier websites, applicant tracking systems, job
              application pages, or other external services.
            </p>
            <p>
              CDLA.jobs is not responsible for the privacy practices,
              security, content, or policies of third-party websites or
              services. You should review the privacy policies of any
              third-party services you use.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              CDLA.jobs is intended for adults and is not directed to
              children under the age of 13.
            </p>
            <p>
              We do not knowingly collect personal information from children
              under 13. If we learn that we have collected such information,
              we will take reasonable steps to delete it.
            </p>
          </Section>

          <Section title="Changes to This Privacy Policy">
            <p>
              CDLA.jobs may update this Privacy Policy from time to time.
            </p>
            <p>
              Any changes will be posted on this page with an updated
              effective date. Your continued use of CDLA.jobs after updates
              are posted means you accept the revised Privacy Policy.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              If you have questions about this Privacy Policy or our data
              practices, please contact us at:
            </p>
            <address className="not-italic">
              <strong>CDLA.jobs</strong>
              <br />
              5300 Sagewood Dr. H552
              <br />
              Park City, UT 84098
              <br />
              United States
            </address>
          </Section>
        </div>
      </article>
    </SiteShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-brand-rule pt-6">
      <h2 className="text-lg font-semibold text-brand-ink sm:text-xl">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}
