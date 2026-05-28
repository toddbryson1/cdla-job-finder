import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";

// Terms of Service. Copy provided by Todd Bryson — rendered verbatim.
// This page replaces the "Terms of Service (coming)" placeholder in the
// site footer. Update the date in the change log below when material
// changes ship.

export const metadata: Metadata = {
  title: "Terms of Service — CDLA.jobs",
  description:
    "Terms of Service for CDLA.jobs — the CDL-A driver matching and recruiting support service.",
  alternates: { canonical: "https://www.cdla.jobs/terms" },
};

const LAST_UPDATED = "May 25, 2026";

export default function TermsPage() {
  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-brand-muted">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="prose-cdla mt-10 space-y-5 text-base leading-7 text-brand-ink">
          <p>
            Welcome to the official website of{" "}
            <strong>CDLA.jobs</strong>, located at{" "}
            <strong>
              5300 Sagewood Dr. H552, Park City, UT 84098, United States
            </strong>
            .
          </p>
          <p>
            By accessing or using our website, platform, forms,
            driver-matching services, carrier intake tools, or related
            services, you agree to comply with and be bound by these Terms
            of Service. Please review these terms carefully before using our
            services.
          </p>

          <Section title="Scope of Services">
            <p>
              <strong>CDLA.jobs</strong> is a CDL-A driver matching and
              recruiting support service. We help connect CDL-A drivers with
              carriers, recruiters, and transportation companies based on
              driver-submitted information, carrier hiring criteria, job
              availability, location, experience, endorsements, schedule
              preferences, and other relevant matching factors.
            </p>
            <p>
              CDLA.jobs is <strong>not a motor carrier</strong>,{" "}
              <strong>not an employer</strong>, and{" "}
              <strong>not a traditional job board</strong>. We do not make
              hiring decisions, guarantee employment, guarantee driver
              placement, or guarantee that a carrier will contact, interview,
              or hire any driver.
            </p>
            <p>
              Our services may include driver intake forms, carrier matching,
              lead delivery, prequalification workflows, carrier
              communications, job opportunity routing, and integrations with
              third-party systems such as applicant tracking systems, CRM
              tools, email platforms, or other recruiting technology.
            </p>
          </Section>

          <Section title="User Responsibilities">
            <p>
              Users agree to provide accurate, current, and complete
              information when using CDLA.jobs.
            </p>
            <p>
              Drivers are responsible for ensuring that all information they
              submit is truthful and accurate, including but not limited to
              CDL status, endorsements, experience, work history, accident
              history, driving record information, criminal history
              disclosures, location, and job preferences.
            </p>
            <p>
              Carriers, recruiters, and hiring partners are responsible for
              providing accurate hiring criteria, job details, contact
              information, operating areas, compensation information, and any
              other information needed to match drivers with available
              opportunities.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of any
              account credentials, access links, or private information
              associated with your use of CDLA.jobs. Unauthorized use,
              misuse, or sharing of access may result in termination or
              limitation of services.
            </p>
          </Section>

          <Section title="Driver Consent and Information Sharing">
            <p>
              By submitting information through CDLA.jobs, drivers authorize
              CDLA.jobs to use the submitted information to evaluate
              potential matches with participating carriers and recruiting
              partners.
            </p>
            <p>
              When a driver expresses interest in, selects, or consents to a
              specific carrier or opportunity, CDLA.jobs may share the
              driver&rsquo;s submitted information with that carrier,
              recruiter, applicant tracking system, or related hiring
              workflow.
            </p>
            <p>
              CDLA.jobs does not guarantee that submitted information will
              result in a job offer, interview, application approval, or
              employment.
            </p>
          </Section>

          <Section title="Carrier and Recruiter Responsibilities">
            <p>
              Carriers and recruiters using CDLA.jobs are responsible for
              complying with all applicable federal, state, and local laws,
              rules, and regulations related to employment, recruiting,
              transportation, driver qualification, privacy, background
              checks, and hiring.
            </p>
            <p>
              This includes, where applicable, compliance with Department of
              Transportation requirements, Federal Motor Carrier Safety
              Administration regulations, Fair Credit Reporting Act
              requirements, Equal Employment Opportunity laws, and any other
              laws governing driver qualification or employment decisions.
            </p>
            <p>
              CDLA.jobs does not perform final driver qualification
              determinations, make employment decisions, or replace a
              carrier&rsquo;s legal hiring obligations.
            </p>
          </Section>

          <Section title="No Employment Guarantee">
            <p>
              CDLA.jobs does not guarantee employment for drivers and does
              not guarantee hires for carriers.
            </p>
            <p>
              Any employment relationship, interview process, onboarding
              process, qualification review, background check, motor vehicle
              record review, drug testing process, or hiring decision is
              handled directly between the driver and the carrier or hiring
              party.
            </p>
          </Section>

          <Section title="Third-Party Services and Integrations">
            <p>
              CDLA.jobs may use or connect with third-party tools, software,
              applicant tracking systems, CRM systems, communication
              platforms, analytics tools, or carrier systems.
            </p>
            <p>
              We are not responsible for the availability, accuracy,
              policies, security, or performance of third-party services.
              Use of third-party services may be subject to additional terms
              and privacy policies from those providers.
            </p>
          </Section>

          <Section title="Intellectual Property">
            <p>
              All content, branding, text, graphics, designs, logos,
              workflows, forms, website materials, and other materials on
              this website are the property of CDLA.jobs or its content
              suppliers and are protected by applicable copyright, trademark,
              and intellectual property laws.
            </p>
            <p>
              Unauthorized copying, reproduction, distribution, modification,
              or commercial use of materials from this website is prohibited
              unless expressly authorized in writing by CDLA.jobs.
            </p>
          </Section>

          <Section title="Prohibited Uses">
            <p>
              You agree not to use CDLA.jobs for unlawful, fraudulent,
              abusive, misleading, or unauthorized purposes.
            </p>
            <p>Prohibited uses include, but are not limited to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Submitting false or misleading driver information</li>
              <li>Misrepresenting carrier hiring opportunities</li>
              <li>Attempting to access systems or data without authorization</li>
              <li>
                Scraping, copying, or reselling CDLA.jobs data without
                permission
              </li>
              <li>
                Using the service to harass, spam, or improperly contact users
              </li>
              <li>
                Violating applicable employment, privacy, transportation, or
                recruiting laws
              </li>
            </ul>
            <p>
              CDLA.jobs reserves the right to suspend, restrict, or terminate
              access for users who violate these terms.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              CDLA.jobs will not be liable for any indirect, incidental,
              special, consequential, punitive, or exemplary damages
              resulting from the use of, or inability to use, our website or
              services.
            </p>
            <p>
              We aim to provide reliable service, but we do not warrant that
              the website, its content, matching process, integrations,
              communications, or services will be error-free, uninterrupted,
              fully accurate, or available at all times.
            </p>
            <p>
              Users understand that recruiting, hiring, driver qualification,
              and job matching involve third-party decisions and information
              beyond the control of CDLA.jobs.
            </p>
          </Section>

          <Section title="Disclaimer of Warranties">
            <p>
              CDLA.jobs provides its website and services on an &ldquo;as
              is&rdquo; and &ldquo;as available&rdquo; basis.
            </p>
            <p>
              We make no warranties, express or implied, regarding the
              accuracy, completeness, reliability, availability, suitability,
              or results of the website, matching process, driver
              information, carrier information, job opportunities, or
              related services.
            </p>
          </Section>

          <Section title="Amendments and Changes">
            <p>
              CDLA.jobs reserves the right to amend or update these Terms of
              Service at any time.
            </p>
            <p>
              Any changes will be posted on this page. It is your
              responsibility to review these terms periodically. Continued
              use of the website or services after modifications are posted
              indicates your acceptance of the revised terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              If you have questions about these Terms of Service, please
              contact us at:
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
