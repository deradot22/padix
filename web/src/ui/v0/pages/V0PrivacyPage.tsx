import { ReactNode } from "react";

export function V0PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-foreground">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective as of 2026-05-09</p>
      </header>

      <p>
        This privacy policy applies to the padix app (hereby referred to as "Application") for mobile devices that
        was created by Nikita Ostroverkhiy (hereby referred to as "Service Provider") as a Free service. This
        service is intended for use "AS IS".
      </p>

      <Section title="Information Collection and Use">
        <p>The Application collects information when you download and use it. This information may include:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Your device's Internet Protocol address (e.g. IP address)</li>
          <li>The pages of the Application that you visit, the time and date of your visit, the time spent on those pages</li>
          <li>The time spent on the Application</li>
          <li>The operating system you use on your mobile device</li>
        </ul>
        <p>The Application does not gather precise information about the location of your mobile device.</p>
        <p>The Application does not use Artificial Intelligence (AI) technologies to process your data or provide features.</p>
        <p>
          The Service Provider may use the information you provided to contact you from time to time to provide you
          with important information, required notices and marketing promotions.
        </p>
        <p>
          For a better experience, while using the Application, the Service Provider may require you to provide us
          with certain personally identifiable information, including but not limited to Email, UserId, Gender. The
          information that the Service Provider request will be retained by them and used as described in this
          privacy policy.
        </p>
      </Section>

      <Section title="Third Party Access">
        <p>
          Only aggregated, anonymized data is periodically transmitted to external services to aid the Service
          Provider in improving the Application and their service. The Service Provider may share your information
          with third parties in the ways that are described in this privacy statement.
        </p>
        <p>
          Please note that the Application utilizes third-party services that have their own Privacy Policy about
          handling data. Below are the links to the Privacy Policy of the third-party service providers used by the
          Application:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <ExternalLink href="https://www.google.com/policies/privacy/">Google Play Services</ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://firebase.google.com/support/privacy">Google Analytics for Firebase</ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://firebase.google.com/support/privacy/">Firebase Crashlytics</ExternalLink>
          </li>
        </ul>
        <p>The Service Provider may disclose User Provided and Automatically Collected Information:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>as required by law, such as to comply with a subpoena, or similar legal process;</li>
          <li>
            when they believe in good faith that disclosure is necessary to protect their rights, protect your
            safety or the safety of others, investigate fraud, or respond to a government request;
          </li>
          <li>
            with their trusted services providers who work on their behalf, do not have an independent use of the
            information we disclose to them, and have agreed to adhere to the rules set forth in this privacy
            statement.
          </li>
        </ul>
      </Section>

      <Section title="Opt-Out Rights">
        <p>
          You can stop all collection of information by the Application easily by uninstalling it. You may use the
          standard uninstall processes as may be available as part of your mobile device or via the mobile
          application marketplace or network.
        </p>
      </Section>

      <Section title="Data Retention Policy">
        <p>
          The Service Provider will retain User Provided data for as long as you use the Application and for a
          reasonable time thereafter. If you'd like them to delete User Provided Data that you have provided via the
          Application, please contact them at{" "}
          <ExternalLink href="mailto:css101782@gmail.com">css101782@gmail.com</ExternalLink> and they will respond
          in a reasonable time.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The Service Provider does not use the Application to knowingly solicit data from or market to children
          under the age of 13.
        </p>
        <p>
          The Application does not address anyone under the age of 13. The Service Provider does not knowingly
          collect personally identifiable information from children under 13 years of age. In the case the Service
          Provider discover that a child under 13 has provided personal information, the Service Provider will
          immediately delete this from their servers. If you are a parent or guardian and you are aware that your
          child has provided us with personal information, please contact the Service Provider (
          <ExternalLink href="mailto:css101782@gmail.com">css101782@gmail.com</ExternalLink>) so that they will be
          able to take the necessary actions.
        </p>
      </Section>

      <Section title="Security">
        <p>
          The Service Provider is concerned about safeguarding the confidentiality of your information. The Service
          Provider provides physical, electronic, and procedural safeguards to protect information the Service
          Provider processes and maintains.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          This Privacy Policy may be updated from time to time for any reason. The Service Provider will notify you
          of any changes to the Privacy Policy by updating this page with the new Privacy Policy. You are advised to
          consult this Privacy Policy regularly for any changes, as continued use is deemed approval of all changes.
        </p>
      </Section>

      <Section title="Your Consent">
        <p>
          By using the Application, you are consenting to the processing of your information as set forth in this
          Privacy Policy now and as amended by us.
        </p>
      </Section>

      <Section title="Contact Us">
        <p>
          If you have any questions regarding privacy while using the Application, or have questions about the
          practices, please contact the Service Provider via email at{" "}
          <ExternalLink href="mailto:css101782@gmail.com">css101782@gmail.com</ExternalLink>.
        </p>
      </Section>
    </article>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}

function ExternalLink(props: { href: string; children: ReactNode }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-4 hover:underline"
    >
      {props.children}
    </a>
  );
}
